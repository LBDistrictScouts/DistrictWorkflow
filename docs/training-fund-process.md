# Training Fund process revision

The full process is defined in `packages/domain/src/training-fund/machine.ts` and
rendered by Sketch on the Training Fund pages. It is an executable pure XState
definition, with explicit acknowledgement events for task setup, response receipt
and email acceptance. Runtime integration is still pending: the deployed Temporal
workflow uses `runtime-machine.ts` and does not yet collect bank details, record
rejections, offer appeals or email the Trustee Agenda. Compatibility state helpers
continue to use that runtime definition until the new process is integrated.

## Approval task model

Use **one shared approval task, many individual assignments and decisions**.
An assignment is a person's opportunity to decide, not an independent workflow
step that must finish. One person contributes at most one final decision. This
keeps the task's overall outcome distinct from each person's response.

At setup, resolve the `training-fund-approvers` user tag to active directory users.
Deduplicate by user UUID, since a user can have multiple tagged email addresses.
Snapshot the eligible users and the required majority for this application. Later
tag synchronisation must not silently change an open application's electorate.
An empty or unresolved approver group blocks setup for operator correction; it
must never count as automatic approval. Notification retries reuse the same task
and assignment identities.

Approval requires `floor(eligibleApprovers / 2) + 1` distinct approving users.
For three approvers, two approvals suffice. Completing the shared task closes
outstanding assignments as no longer required. Concurrent responses must be
serialized so only one overall outcome advances the workflow. Repeat submission
of the same decision is idempotent; an obsolete assignment cannot change a settled
outcome.

Rejection also requires `floor(eligibleApprovers / 2) + 1` distinct rejecting users.
For three approvers, two rejections settle the task as rejected. One rejection
does not veto the application. Approval and rejection counts are separate, and
each person can submit only one final decision.
Until an outcome is reached, missing responses are pending rather than rejections.
No timeout, automatic rejection or tie-break rule has been specified.

## Successful application

1. Receive and validate the request; retain its stable submission identity.
2. Set up the shared approval task from the approver tag snapshot.
3. Record individual approval/rejection decisions until the outcome is settled.
4. After approval, create an applicant response task and email its link requesting
   bank details. Email delivery alone does not complete this task.
5. Validate and securely save the applicant's response, then complete that task.
6. Create a treasurer payment task referencing the approved application, amount
   and bank-details record. Do not open payment before bank details are received.
7. The treasurer pays using their normal banking process and records the payment
   reference/date. Recording payment completes the workflow; the app transfers
   no money.

Bank details belong in a separately protected record, outside general task context,
approval snapshots, emails, logs and Temporal history. The workflow carries an
opaque record reference and receipt status. Access to the full details is limited
to the applicant response operation and the authorised treasurer payment task.
The bank-details form's required fields, encryption and retention policy must be
settled before implementing collection.

## Applicant response types

Response complexity describes the input, not an authentication tier:

- **Simple:** one choice from configured options, such as A, B or C. Each option
  can have its own personal email link. The link identifies the response task and
  preselects an allowed option. Opening a link does not record a decision; a
  confirmation POST records it, so email scanners and link previews cannot
  accidentally answer a task. Repeated submission is idempotent.
- **Complex:** a frontend form with multiple fields and server-side validation.
  Bank details use this type. An appeal statement with free text is also complex.

Both types refer to one response task and its intended recipient, expire according
to the task's link policy, and stop accepting new answers once completed. Access
requirements are independent of whether the response is simple or complex; the
current site's sign-in requirement remains unless a separate decision changes it.

## Shared payment subprocess

The successful branch invokes `paymentFlowMachine` from
`packages/domain/src/payments/machine.ts`. Training Fund supplies the approved
amount, applicant and bank-details form configuration. The child resolves
the treasurer itself from the `district-treasurer` tag. The reusable
child owns supporting-details collection and payment recording; the parent moves
to `paid` only when it completes. See [Reusable payment workflow](payment-workflow.md).
Other callers can provide receipt-information fields without depending on Training Fund.

## Rejected application

1. Complete the approval task with the rejected outcome and close outstanding
   assignments. Include the outcome and application reference in the notification.
2. Email the applicant the rejection and a link to an appeal response task.
3. If the applicant appeals, save the statement and email it to the configured
   Trustee Agenda address with the application reference and decision context.
   Record the notification outcome so ordinary retries do not create separate
   appeal submissions. Email delivery is at least once, as with other SES tasks.
4. Finish this process as `appeal_referred` once SES accepts the agenda email.
   The later trustee decision is outside the currently described process.

The Trustee Agenda integration is email-only for this revision. Configure its
recipient using `TRAINING_FUND_TRUSTEE_AGENDA_EMAIL`; a missing address must cause
notification retry/configuration correction, not silently lose an appeal. Agenda
emails must not expose bank details. No appeal deadline or no-response/decline outcome has been specified;
the workflow must not invent one.

## Implementation implications

- Integrate the Training Fund ledger with workflow executions, shared tasks,
  individual assignments and append-only decision submissions. The existing
  general task schema has tag ownership and submissions, but no individual
  assignment records or settled approval outcome yet.
- Extend the XState definition with approval setup, approval/rejection outcomes,
  applicant bank-details response, payment, appeal response and agenda referral.
  Sketch should continue rendering the actual machine.
- Temporal owns notifications and waits. Activities resolve the initial tag
  membership, persist task/decision records and perform external integrations.
- Use stable task/assignment/submission identities and retry-safe completion
  between PostgreSQL and Temporal. A notification retry must not create a second
  applicant task or agenda item.
- Introduce the revised process as a versioned execution path. Existing Temporal
  histories retain their current behavior unless explicitly migrated.

## Access and remaining process details

Simple/complex response types do not change authentication. The current site
requires Cognito sign-in even for task links; no authentication change has been
specified. Appeal deadlines and no-response/decline handling remain unspecified.

Confirmed: both approval and rejection require a majority; Trustee Agenda referral
is an email rather than a new shared agenda task or an external agenda API.
