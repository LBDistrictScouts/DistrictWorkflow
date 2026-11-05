# District Training Fund

The full agreed process definition is in
[`packages/domain/src/training-fund/machine.ts`](../packages/domain/src/training-fund/machine.ts)
and is displayed on the workflow pages. See the [process revision](training-fund-process.md)
for rejection, bank-details and appeal steps. Those steps still require runtime
integration; the operating instructions below describe the current compatibility
workflow, whose definition is `runtime-machine.ts`.

An application starts in the members website or is registered by workflow staff,
enters through SQS, waits for two of three assigned people to
approve, then becomes a payment task for a separate district treasurer. Recording
payment completes the workflow. No bank transfer is initiated by this application.

```mermaid
flowchart LR
  M[Signed-in member form] --> P[Server validates session and application]
  S[Authorised staff registration] --> P
  P --> Q[SQS]
  Q --> W[Temporal workflow]
  W --> A[Reviewer 1]
  W --> B[Reviewer 2]
  W --> C[Reviewer 3]
  A --> ALL{Two of three approved?}
  B --> ALL
  C --> ALL
  ALL -->|Yes| T[Treasurer payment task]
  T --> R[Record payment reference and date]
```

## Message contract

The canonical **JSON Schema, draft 2020-12**, is
[`../packages/contracts/src/training-fund/application.schema.json`](../packages/contracts/src/training-fund/application.schema.json).
An example is [`training-fund.application.example.json`](training-fund.application.example.json).
Send the JSON object as the raw SQS message body, with no SNS envelope. Enable
format validation (AJV plus `ajv-formats`); reject unknown properties. The producer
and consumer both validate. In addition to the schema, they enforce requested
funding <= course cost, a cross-field check that standard JSON Schema cannot
express. Money is GBP in integer pence. The £100,000 schema maximum is a technical
input limit, not an award policy or entitlement.

The initial fields are applicant name/email/group/role, optional membership number,
course/provider/date/location/cost, requested amount, reason, benefit to Scouting,
other funding and a declaration. Confirm these with the fund owner before launch.
Do not collect bank details in this contract.

Use a UUID `applicationId` generated once per submission. Reuse the same ID and
payload after an ambiguous timeout. Submission timestamps must also remain stable.
Never send reviewer identities in the application: they come from trusted routing
configuration. An altered payload with an already-used ID will not amend the
original application. There is no edit/resubmission process in this version.

## Members website integration

The supplied Next.js form lives at `/workflows/training-fund`. It verifies the
member session on the server and posts to `/api/training-fund/applications`, which
checks origin and session again, then calls the shared application service.
The SQS adapter sends the validated application, returning `202` only after AWS
accepts the message. This means *queued*, not already approved or paid.

Set `MEMBERS_SESSION_URL` and `MEMBERS_SESSION_COOKIE_NAME` to the existing
members validator and cookie. The validator must return HTTP 200 with
`{ "authenticated": true }`. Unconfigured, expired and unavailable sessions fail
closed. The member-session validator supplies access, not applicant identity. New frontend
submissions select a directory member UUID; the server resolves contact details
as described under Directory-backed applicant selection below.

The existing `district-site` checkout is unchanged. To expose this form inside that
members site, route the form and its API through the same protected members origin
(and forward the named cookie), or port the form to the members site and implement
its server-side SQS producer using the contract above. A link to an unrelated host
will not carry a host-only members cookie. Confirm routing/cookie scope before
launch; do not weaken the session check to work around it. Set `PUBLIC_APP_ORIGIN`
to the browser's actual origin behind the proxy.

If implementing a separate website producer, validate the member session there,
validate against the same JSON Schema, enforce the cross-field amount constraint,
and send using a server-side IAM role with `sqs:SendMessage` on this queue only.
Never give AWS or Temporal credentials to the browser. Add an
entry card to the members hub pointing at the deployed form. No production website
or AWS resource has been changed by this implementation.

## Configure and run

1. Run `corepack yarn install --immutable` and `corepack yarn build:packages` at the
   repository root (Node 24 recommended).
2. Copy `apps/worker/.env.example` to `apps/worker/.env` and
   `apps/web/.env.example` to `apps/web/.env.local`.
3. Follow the [database setup guide](../packages/persistence/README.md), set
   `DATABASE_URL` in web and worker, and apply the migration before intake.
   Copy `apps/worker/training-fund.routing.example.json` to
   `apps/worker/training-fund.routing.json`; configure three distinct reviewers and
   a separate treasurer. The consumer snapshots routing for each new application.
4. Provision the queue/DLQ using `infrastructure/training-fund-sqs.yaml`. Set
   `TRAINING_FUND_QUEUE_URL` and `AWS_REGION` for web and consumer.
5. Verify the SES sender and configure the worker sender settings. Use IAM roles
   in deployment; SES sandbox accounts also require verified recipients.
6. Generate a signing secret, for example `openssl rand -hex 32`, and set the same
   `TRAINING_FUND_SIGNING_KEY` in web and worker. Configure the public task origin
   and web session settings. The previous private API URL/key are no longer used.
7. From the repository root, run these in separate terminals:

   ```sh
   corepack yarn workspace @district/worker server
   corepack yarn dev:worker
   corepack yarn workspace @district/worker training-fund:consume
   corepack yarn dev:web
   ```

For compiled services, run root `corepack yarn build`, then start the web and worker
with `corepack yarn workspace @district/web start` and
`corepack yarn workspace @district/worker start`. From `apps/worker`, run
`node dist/intake/training-fund.js` as a separate supervised consumer process.
Next.js is the only application HTTP server and connects directly to SQS/Temporal.

IAM: the Next.js producer needs `sqs:SendMessage`; the consumer needs
`sqs:ReceiveMessage` and `sqs:DeleteMessage` on the application queue; the worker
needs `ses:SendEmail` restricted to the configured sender identity. Separate these
roles in deployment. Do not make the queue publicly writable. Alarm on the DLQ,
consumer failures, failed/retrying notification activities and old pending tasks.

## Reviewer and treasurer tasks

Each reviewer receives a personal SES email with a signed task link. The link is
an **access capability**: anyone holding it can view the application and act as
that assigned person. Do not forward links. This implementation does not claim
that a link proves who clicked it; if named-user authentication is required, add
member/SSO identity verification to the task API before deployment.

Tokens include workflow ID, assigned person ID, role and expiry, signed with HMAC.
The token is in a URL fragment (not server access logs), removed from the address
bar after loading, held in memory and sent in POST bodies. No action happens on
GET. Refreshing the page after removal requires reopening the email link. Avoid
analytics/session recording on the task page. Browser responses are not cached.
The application service derives the acting person from the signed token, never a client field,
and checks assignment and state. Direct Temporal access is a privileged admin
boundary and must be secured separately.

A repeated approval counts once. Each reviewer has a personal task link into one
shared approval stage. After two distinct reviewers approve, the remaining review
is no longer required and disappears from outstanding actions. The workflow
sends the treasurer a task. The treasurer arranges payment through the existing
process, then enters its reference and date. Other reviewers cannot record payment.
No rejection, delegation, reminders or award-amount changes are included yet.

Links expire after 30 days by default (`TRAINING_FUND_LINK_DAYS`, 1–365). An
operator can resend a new link to an **existing outstanding assignee**:

```sh
cd apps/worker
corepack yarn training-fund:resend <application-uuid> <person-id>
```

This command sends a real email. It does not reassign the task. Keep the signing
key stable while links are active; rotating it invalidates old links. Resending
creates a new link but does not revoke other unexpired links.

## Durability, duplicates and recovery

The [PostgreSQL/Drizzle ledger](../packages/persistence/README.md) stores new
consumer-started applications and their decision history. Configure `DATABASE_URL`
for worker, consumer and web, and apply root `corepack yarn db:migrate` before
starting new intake. New starts carry `{ persistState: true }`; existing
two-argument workflows remain history-only until a separate backfill.

The consumer starts workflow ID `training-fund-<applicationId>` with
`REJECT_DUPLICATE` and deletes the SQS message only after a successful start or a
confirmed existing execution. It never waits for people while holding an SQS
receipt. Invalid messages and transient failures remain for redelivery; the
provided queue sends them to its DLQ after five receives. Fix invalid messages
before redriving. Monitor failures: SES delivery retries independently in Temporal.

Temporal preserves approvals across worker/server restarts. SES delivery is
at-least-once; a crash after sending may result in duplicate emails, but repeat
clicks cannot add approvals or duplicate payment records. A successful API response
means the Temporal update was durably accepted and completed. An ambiguous timeout
is safe to retry with the same action and payment details.

**Persisted applications use the PostgreSQL ledger for deduplication beyond
Temporal retention.** The consumer checks the immutable submission before starting
another execution. Completed task snapshots remain available after history expires.
New workflow Updates confirm only after the snapshot/audit transaction commits.
SQS acceptance can precede DB initialization; Temporal retries that initial write.

**Legacy two-argument workflows remain retention-limited.** Do not redrive their
application IDs after history expiry until they are explicitly backfilled. Configure
Temporal retention longer than queue/redrive windows. Export payment records to
the district's accounting system; the application does not perform transfers.

## Verification

```sh
corepack yarn typecheck
corepack yarn test
corepack yarn lint
corepack yarn build
corepack yarn workspace @district/worker test:integration
corepack yarn test:web
```

Integration tests launch an isolated Temporal dev server using `apps/worker/.bin/temporal`,
mock only email delivery, exercise the real durable workflow and replay its history.
They do not send email, contact AWS SQS, or use the normal development namespace.
Run your local PostgreSQL server and configure `TEST_DATABASE_URL`
before database/integration tests. Every test owns a temporary database; see the
[database testing guide](../packages/persistence/README.md).

## Registering applications in the workflow platform

Staff can use **Workflows → District Training Fund → Register an application** at
`/workflows/training-fund/register`. They enter the applicant's details, training
and funding request, plus how the application arrived (email, phone, post or other),
the received date and a correspondence reference. They must confirm that the
record is accurate and that the applicant agreed to sharing their details. Keep
original correspondence in the normal records system; do not paste bank details.

This route uses the same SQS intake, validation, duplicate handling, two-of-three approvals
and treasurer task as the members website. Registering an application grants no
approval and does not bypass review. Do not register an application a second time
if it has already been submitted through the website; reuse its existing reference.

Configure `WORKFLOW_SESSION_URL` and `WORKFLOW_SESSION_COOKIE_NAME` in the front end.
The trusted staff session validator must return:

```json
{
  "authenticated": true,
  "user": { "id": "staff-123", "name": "Example Registrar" },
  "permissions": ["training-fund:register"]
}
```

Both the page and `POST /api/training-fund/registrations` check this permission.
The API checks origin, obtains the registrar from the verified session and stamps
`submission.registeredBy` and `submission.registeredAt` itself. Client-supplied
provenance is overwritten. General membership alone is insufficient; unconfigured
or unavailable staff authentication fails closed. Connect this adapter to the
platform's sign-in/session service before use; it does not create a new login system.

Schema v1.0 has an optional `submission` field (existing messages remain valid):

- `{ "channel": "members" }` for the members API.
- `{ "channel": "staff", "receivedVia": "email", "receivedAt": "2026-10-05",
  "reference": "Email subject / correspondence reference",
  "registeredBy": { "id": "staff-123", "name": "Example Registrar" },
  "registeredAt": "2026-10-05T15:00:00Z" }` for platform registration.

Reviewer/treasurer pages display provenance. Legacy messages without it are
labelled as external submissions with no recorded source. SQS trusts its authenticated producers to attest this metadata; restrict
producer IAM access accordingly. Deploy the updated schema consumer
before enabling either producer's new metadata.

To test both Next.js entry routes against local mock session/SQS services, first
run root `corepack yarn build`, then root `corepack yarn test:web`.
This checks member/staff separation, origin checks, provenance spoofing and page access.

Training Fund task emails use the shared district-themed HTML/plain-text template.
See [reusable activities](reusable-activities.md) for the shared sender settings,
local preview command and SES delivery semantics. Existing `TRAINING_FUND_FROM_EMAIL`
configuration remains supported; `NOTIFICATION_FROM_EMAIL` takes precedence.

Approval quorum changes use the Temporal `training-fund-majority-v1` patch. New
executions record `requiredApprovals: 2`. Histories started before this patch keep
the unanimous rule for deterministic replay; absent `requiredApprovals` means all
assigned approvers are required. Their task pages show the legacy threshold.

## Local AWS testing with Moto

Run `corepack yarn aws:local:up` at the repository root. This starts the pinned
Moto server in Docker on loopback port 4566, creates the application queue and DLQ,
and verifies a local SES sender. It updates only the ignored web/worker env files
with local endpoints, fake AWS credentials and a shared signing key. Existing
remote queue settings or mismatched keys are rejected instead of overwritten.
Rerun the command after recreating the container: resources are in-memory.

Restart Local Dev (`corepack yarn dev`) to load the configuration and start its
SQS consumer. Use the Cognito-protected **Register an application** form; the member
form still requires the separate members-session validator. Existing Cognito and
member authentication checks remain in force. Reviewer routing defaults to the
example addresses in `apps/worker/training-fund.routing.json`; adjust it to test
Actions for your signed-in account. Moto captures SES messages rather than sending
real email. Its resource dashboard is at http://localhost:4566/moto-api/.

Run `corepack yarn test:aws:local` after starting Moto to test real SDK calls through
submission, queue delivery/acknowledgment, a persisted Temporal workflow, captured
review/payment emails, two-of-three approval and payment. This uses a disposable
PostgreSQL database (`TEST_DATABASE_URL` in the worker env) and a temporary Temporal
server. Stop only the emulator with `corepack yarn aws:local:down`.

The container emulates AWS APIs, not IAM policy enforcement or every AWS behavior.
Keep production IAM and cloud integration checks separately. Local SDK endpoint
settings and fake credentials must stay out of deployed environments.

## Directory-backed applicant selection

Both Training Fund frontend forms now select an applicant using the authenticated
member search (`GET /api/members/search?q=...`). Searches match active directory
users by name or email, require at least two characters, return at most ten unique
users, and do not expose inactive members. Select a result rather than typing
applicant name, email, group, role or membership number.

The browser submits schema version `1.1` with `applicant: { userId: '<member UUID>' }`.
The API resolves the UUID to an active directory record with a unique contact email
and constructs the canonical applicant snapshot `{ userId, name, email }` before
queueing. Browser-supplied contact fields are rejected. Directory lookup failures
are retryable service errors; missing/inactive/uncontactable selections produce a
validation error. No free-text contact fallback is used.

The ledger stores `applicant_user_id` as a foreign key to `users.id`, checked
against the UUID in the snapshot. Contact snapshots support existing notification
and review code; the UUID is the applicant identity. Retry deduplication ignores
contact-snapshot changes for v1.1 applications while still rejecting a different
member UUID or changed application details. Original snapshots remain immutable.
Apply `0013_training_fund_applicant` before using the updated form.

Legacy v1.0 queued applications and histories remain valid with their original
name/email/group/role structure. New v1.1 submissions require the member UUID;
group, role and membership number are no longer required on the frontend.

### Reviewer resolution for new executions

New Temporal executions invoke the reusable `resolveRoleUser('training-fund-approvers')`
activity before persisting initial state or notifying reviewers. The returned users
replace the input routing's approvers. Multiple appointment-email matches for one
user count as one reviewer; selection uses a deterministic, unshared appointment
email. Exactly three distinct active reviewers, separate from the treasurer, are
required to preserve the existing two-of-three policy. Invalid resolution fails
explicitly rather than falling back to the routing file.

The treasurer still comes from `TRAINING_FUND_ROUTING_FILE`, which remains required
by intake. Existing histories retain their recorded reviewers and approvals via
the `training-fund-role-approvers-v1` Temporal patch. Restart the worker after
rebuilding to enable resolution for new applications; running applications are
not reassigned.
