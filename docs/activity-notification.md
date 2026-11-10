# Activity notification intake and approval

The Temporal worker hosts `activityNotificationIntakeWorkflow`. It orchestrates
SQS receive, schema validation, case persistence, starting a separate
`activityNotificationWorkflow` for each application, and SQS acknowledgement.
All AWS and database calls run in activities. The intake workflow continues as
new every 100 polls to bound history; case workflows continue as new after 1000
approval checks. Child workflows survive intake cancellation and continuation.

Messages use the version 1 `district-site/schemas/activity-notification-queue.schema.json`
envelope. Copies of both producer schemas live in
`packages/contracts/src/activity-notification`. Files remain in S3; their exact
version, checksum and storage references are retained with the complete form and
authenticated submitter identity.

## Start

Apply migrations with `corepack yarn db:migrate`. Configure `apps/worker/.env`:

- `DATABASE_URL` and the usual `TEMPORAL_*` connection settings.
- `AWS_REGION`, AWS credentials, and `ACTIVITY_NOTIFICATION_QUEUE_URL`.
- `ACTIVITY_NOTIFICATION_ENVIRONMENT`: `dev`, `test`, or `prod`.
- `NOTIFICATION_FROM_EMAIL`: an SES-verified sender (the existing Training Fund
  sender is supported as a fallback); optional `NOTIFICATION_REPLY_TO_EMAIL`.

Sync the `activity-out-of-district` tag and its member assignments before intake.
The worker needs SQS ReceiveMessage/DeleteMessage permissions, SES SendEmail
permission and database writes.
Configure a redrive policy and DLQ on the source queue.

```sh
corepack yarn build:packages
corepack yarn workspace @district/worker dev
# In another terminal, start the durable intake workflow (then this command exits):
corepack yarn workspace @district/worker activity-notification:consume
```

Configure queue settings on the **worker**, which performs the SQS activities.
The start command uses one workflow ID per environment and is safe to rerun.
For deployment, build the worker, run `node dist/worker.js`, and invoke
`node dist/intake/activity-notification.js` once from `apps/worker` to start intake.

## Case and approval lifecycle

Each submission creates an open case under `activity-notification`. The title is
the activity and the reference combines environment and form idempotence key.
The case workflow registers its execution and published workflow definition,
links the case to that execution, and creates one shared approval task.
Initialization is idempotent, including activity retries and continued runs.

The domain XState machine is `packages/domain/src/activity-notification/machine.ts`:
`awaiting_approval` → `approved` (final). The first approval completes the task.
Current active members of the `activity-out-of-district` tag can see and approve
it through Actions or `/workflows/activity-notification/tasks`. This assignment
applies to every notification type in this intake, as configured for this workflow.

Approval locks the shared task, rechecks membership, records the winning user and
an immutable task submission and a reporting snapshot, and completes it in one
transaction. Further
approvals return the existing result without another audit entry. The task
immediately disappears from all reviewers' pending Actions. Temporal rechecks
every 30 seconds, then marks the case and executions completed with outcome
`approved`. The workflow then emails the applicant contact (`notification.email`,
addressed to `notification.leaderName`) using the shared themed SES sender. The
email includes the activity, location, dates, submission reference and approval
time. The authenticated submitter may be a different person; their email is not
used as the applicant contact.

Email delivery failures retry through Temporal without reversing the approval or
losing its statistics. The workflow returns only after the notification activity
succeeds. The SES message ID and acceptance timestamp are saved on the application
so ordinary activity retries skip a previously recorded send. SES has no send
idempotency key: a crash after SES accepts an email but before the receipt is
saved can cause a duplicate email. The recorded timestamp means SES accepted the
message, not confirmed inbox delivery. Existing task digests can still include
pending approval tasks.

The workflow change uses a Temporal patch marker so older completed histories
replay without sending historical emails. In-flight workflows reaching the new
notification step send the approval email.

## Delivery and failure handling

SQS acknowledgement occurs after the case commit and successful durable child
workflow start (or recognition of the existing workflow). Human approval never
holds an SQS receipt. Acknowledgement failures are safe to redeliver. Child
initialization retries database or missing-tag failures through Temporal even
when the original message has already been acknowledged.

Identical messages reuse the case and workflow. Submission ID and form idempotence
key are unique per environment. Reusing either with different envelope content
is a conflict left for retry/DLQ. Retries must preserve the envelope, including
submission ID and receipt timestamps. Invalid or cross-environment messages are
also retained for redrive. Polling uses a 20-second wait and 120-second visibility.
The producer remains responsible for directory, permit and participant checks;
the consumer validates both schemas and activity date ordering.


## Statistics storage

`activity_notification_statistics` contains one row per approved case, with a
primary key on `workflow_case_id`. The first approval writes it atomically with
the task decision, so concurrent approvals and retries cannot double-count an
application. Workflow completion also repairs a missing reporting row for an
approval made by an older worker. Full form data and file references remain in
`activity_notification_applications`, linked by the case ID.

Reporting columns include environment, notification type, activity, venue,
location, time zone, submission and activity dates, approval timestamp and
approver, groups, sections, section IDs, per-section participants, and young
people/young leader/adult counts. `external_provider` is 1 for Yes, 0 for No,
and null when not applicable. Counts describe submitted applications and
participants, not confirmed attendance. Contact details are kept in the linked
form rather than duplicated in the reporting table.

For example, after applying migrations:

```sql
SELECT date_trunc('month', starts_at AT TIME ZONE 'Europe/London') AS month,
       notification_type, count(*) AS approved_activities,
       sum(young_people) AS young_people,
       sum(young_leaders) AS young_leaders, sum(adults) AS adults
FROM activity_notification_statistics
WHERE environment = 'prod'
GROUP BY 1, 2
ORDER BY 1, 2;
```


## Workflow pages

`/workflows/activity-notification` is the Activity Approvals landing page, with
total, open, completed and cancelled case counts. Its three subpages are Form,
Definition and Tasks. Task links open the shared task dialog from the searchable
task table or Actions. Counts and tasks require an active member assignment to
the activity out-of-district team.

The Form page opens the existing district members form. Set
`ACTIVITY_NOTIFICATION_FORM_URL` in the web environment to its full URL; otherwise
the page uses the known form path on the origin of `MEMBERS_SESSION_URL`, when
configured. Submission continues through the existing members form and SQS intake.
