# Reusable workflow activities

`apps/worker/src/activities/index.ts` is the worker's activity registry. Export reusable
activities there and call them through `proxyActivities` using **type-only imports**.
Put I/O in activities; keep workflow code deterministic. Export only activity
functions from the registry, not renderers, configuration helpers or AWS clients.

## Themed email notifications

`sendThemedEmail` is available to any workflow. It returns SES's message ID after
SES accepts the email; this is not proof of inbox delivery. The shared template
uses district teal/green colours, a responsive table layout, inline styles, a
prominent action button and a plain-text alternative. It uses system fonts and
text branding so no external image/font request is needed. Rendering is shared;
workflow-specific wording remains in domain modules.

```ts
import { proxyActivities } from '@temporalio/workflow';
import type { sendThemedEmail } from './activities/email-notifications';

const notifications = proxyActivities<{ sendThemedEmail: typeof sendThemedEmail }>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '10 seconds', maximumInterval: '10 minutes' },
});

// Inside a workflow (use your workflow's input data):
await notifications.sendThemedEmail({
  to: { email: 'volunteer@example.org', name: 'Example Volunteer' },
  subject: 'Your district request is ready',
  category: 'District requests',
  heading: 'Your next step is ready.',
  paragraphs: ['Please review the details of your request.'],
  details: [{ label: 'Reference', value: 'REQUEST-123' }],
  action: { label: 'Open request', url: 'https://workflow.example.org/requests/123' },
  footnote: 'Contact the district team if you need help.',
});
```

Paths in this example assume a workflow module directly in `apps/worker/src`.
Only `to`, `subject`, `heading` and `paragraphs` are required; category, preview,
details, action and footnote are optional. Send to one person per call to avoid
exposing recipient addresses. Fields are plain text, HTML-escaped by the renderer.
Links must use HTTPS (localhost HTTP is allowed for development); scripts, embedded
credentials and header newlines are rejected. The activity treats invalid content
as a non-retryable `InvalidEmailNotification` failure. Sender/configuration and SES
failures remain retryable so operators can repair service configuration.

Set `AWS_REGION` and `NOTIFICATION_FROM_EMAIL` to a verified SES sender email address.
Optionally set `NOTIFICATION_REPLY_TO_EMAIL`. Existing deployments may continue
using `TRAINING_FUND_FROM_EMAIL` as a fallback. Addresses are plain mailboxes, not
`Name <address>` strings. Use the AWS SDK credential chain/worker IAM role with
`ses:SendEmail` restricted to the configured sender. No sender, reply-to or AWS
credentials come from workflow input.

Emails are **at least once**, not exactly once: if SES accepts an email and an
activity crashes before recording completion, retry may send another copy. SES
message IDs provide receipts, not deduplication. Keep linked actions idempotent,
as the Training Fund approvals and payment records are. SES delivery, bounce and
complaint monitoring must be configured separately. Do not enable click tracking
on personal task links without verifying fragment handling and privacy.

Email content and activity results can appear in Temporal history; minimise
sensitive data. Do not log notification payloads or personal task tokens. If a
workflow needs a secret capability, generate it inside a domain-specific activity
and call the delivery helper there rather than passing the secret from workflow
code into a new activity payload.

## Training Fund compatibility

`notifyTrainingFundTask` remains registered under its existing name and keeps its
arguments and return type. It generates the signed task link, creates domain
content with `trainingFundTaskEmail`, then invokes the shared email implementation
inside the same activity. This is a normal function call, not a nested Temporal
activity. No workflow commands, approval state or history structure changed.
Future workflows can call `sendThemedEmail` directly when no secret construction
is needed. The resend command also uses the shared theme.

## Preview and test

Start your PostgreSQL server and configure `TEST_DATABASE_URL` before
running workflow integration tests. See [database testing](../packages/persistence/README.md).

```sh
corepack yarn build:packages
cd apps/worker
corepack yarn email:preview
corepack yarn test
corepack yarn test:integration
corepack yarn typecheck
corepack yarn build
```

Preview creates `.data/email-previews/{approval,payment,general}.html` and `.txt`
using fictional recipients and links. **It sends no emails.** Open the HTML files
locally; verify target email clients before launch (browser previews cannot prove
Outlook/Gmail rendering).

Tests cover escaping, safe links, recipient/header validation, text alternatives,
SES request construction, configuration fallback and error propagation without
contacting AWS. Workflow integration tests cover Training Fund replay.

## Adding another shared activity

Place its implementation under `apps/worker/src/activities/<capability>/`, keep pure formatters and
transport adapters outside the registry, export the activity in `src/activities/index.ts`,
and document its input/result, configuration, retry and idempotency behaviour.
Keep business decisions in the workflow or its domain module. Do not rename or
change signatures of activities already referenced by running workflow histories;
add a new version or retain a compatibility wrapper when needed.

The activity wrappers and Training Fund email content live under
`apps/worker/src/activities/email-notifications/`. The shared renderer and SES
transport live under `packages/integrations/src/email/`. Training Fund orchestration
is under `apps/worker/src/workflows/training-fund/`; its machine is in
`packages/domain`, and its application services are in `packages/application`.
Only registered activity functions are exported from the worker activity registry.

## Standard simple and complex responses

The worker registers `requestSimpleResponse`, `requestComplexResponse` and
`getResponseResult`. Both request activities attach one recipient response to an
**existing platform task** (`tasks.id`); the owning workflow creates that task as
part of its normal execution/step setup. They verify the task belongs to the
calling Temporal namespace, Workflow ID and Run ID. Retries reuse `taskId` and the
same request definition; changing an existing request is rejected.

```ts
import { responseActivities } from './responses';
// Inside a workflow: initialise once, before requesting responses.
const responses = responseActivities();
const { requestId } = await responses.requestSimpleResponse({
  taskId, // UUID of this workflow run's platform task
  recipient: { email: applicant.email, name: applicant.name },
  subject: 'Would you like to appeal?',
  heading: 'Your next step',
  instructions: 'Choose whether to submit an appeal.',
  expiresAt, // Fixed ISO timestamp calculated in workflow code, reused on retry
  choices: [{ value: 'appeal', label: 'Make an appeal' }, { value: 'close', label: 'Close my request' }],
});
const result = await responses.waitForResponse(requestId);
// Handle result.status === 'expired' explicitly.
// A completed simple response includes result.choice.
```

For a complex response, call `requestComplexResponse` with the same common fields
and a `fields` array instead of `choices`. Supported field types are `text`,
`textarea`, `email`, `date` and `select`. Fields have `name`, `label`, optional
`required`, `maxLength` and `pattern`; select fields have `options` with `value`
and `label`. Definitions are fixed when the request is created; the server validates
submitted answers, rejects unknown fields and enforces the allowed options.

Emails use the existing theme. Simple emails contain an individual link for each
choice; complex emails contain a form link. `/responses#token=…&choice=…` preselects
a choice but **does not submit on navigation**. The user confirms with POST.
Fragments are removed from the address bar after loading and kept only in memory.
The response page/API retain Cognito and active directory-user authentication,
plus recipient-email matching and a signed, expiring personal link. Users who sign
in after opening a link should reopen the email link. Link formatting is unrelated
to authentication level. No GET operation completes a task.

Configure the same `RESPONSE_TASK_SIGNING_KEY` (at least 32 bytes) and
`RESPONSE_ENCRYPTION_KEY` (64 hex characters / 32 random bytes) in web and worker.
Set `PUBLIC_APP_ORIGIN` on the worker, or use its existing
`TRAINING_FUND_PUBLIC_URL`. `corepack yarn aws:local:setup` generates matching local
keys if missing without rotating existing ones. Keep encryption keys available
for the lifetime of stored responses; changing them requires data re-encryption.
Apply `0007_response_requests` before calling these activities.

All answers are encrypted with AES-256-GCM in `response_requests`; task submissions
contain only the response ID. Completion locks the task, stores the answer,
appends one submission and completes the platform task in a single transaction.
Repeating the same response succeeds; submitting a different response after
completion conflicts. Completed answers are not returned by the response page/API.

`getResponseResult` returns status and an opaque response ID. Only simple results
include their choice; complex answers never pass through activity results or
Temporal history. Domain-specific authorised server operations can retrieve the
encrypted complex record when needed (for example, a treasurer's payment page).
No generic endpoint exposes saved complex answers. Callers remain responsible for
field-specific access, retention and downstream business actions.

`responseActivities()` installs one `responseTaskCompleted` signal handler and
waits durably using `condition`. The API persists before signalling the pinned run.
A periodic result check repairs a lost post-commit signal; the signal never carries
answers. The request activities return after persistence and email acceptance;
they do not keep an activity running while someone fills in a form. Email delivery
is at least once; duplicate emails refer to the same task. This adds reusable
infrastructure; the revised Training Fund branches still need to be wired to it.

## User profile and task-email preference

Users can edit their own profile at `/profile` (linked from their account in the
header). `PATCH /api/profile` authorises the active signed-in user, checks request
origin and validates the allowed fields. The API does not accept a user ID from
the client. Sign-in addresses and directory data remain managed by the directory;
users can set an optional display-name override without changing those records.

`user_profiles` stores settings by user UUID separately from imported directory
rows, so directory synchronisation does not overwrite preferences. Missing profiles
use the existing response-links behavior. Users choose either `response-links`
(simple email options and complex form links) or `task-notification` (one Open task
link for either response type). The task and its required answer are unchanged.

The standard response request activities resolve the recipient's unique active
directory account and read this setting at email delivery time, outside workflow
code. Unknown or ambiguous accounts retain the default. Preferences affect future
response emails; existing emails remain valid. This is an email presentation
preference, not an email opt-out or an in-app-only notification channel.

## Role user lookup

`resolveRoleUser(tag: string): Promise<RoleUser[]>` is the standard reusable
activity for resolving a role tag. It looks up the exact tag code, excludes
inactive directory users, and returns records shaped as:

```ts
{ id: 'user-uuid', name: 'User name', appointmentEmail: 'role@example.org' }
```

`appointmentEmail` is the email attached to that user's membership of the requested
tag, never an arbitrary primary/login email. All appointment emails are preserved:
a user with two tagged emails appears twice, once per user/email pair. Results are
ordered by user UUID and appointment email. Missing/unassigned tags return `[]`;
multiple users are returned normally. Invalid tag syntax is a non-retryable input
failure; database failures remain retryable.

Callers own cardinality and selection policy. The payment definition requests
`district-treasurer` and requires one distinct user (using the first appointment
email in lexical order if that user has several). Approval workflows can request
`training-fund-approvers` and deduplicate by user ID for voting, retaining the
appointment addresses for notification. Role membership resolution does not grant
sign-in rights or change recipient authentication.

`resolvePaymentTreasurer` is retained only as a compatibility activity for older
histories. New definitions use `resolveRoleUser`; the existing Training Fund
compatibility runtime still uses its original routing until full integration.

Task emails can supply `taskStatus: { taskId, url }` to `sendThemedEmail`.
The activity creates a separate encrypted, read-only status capability and the
shared template adds a remote PNG, a current-status link, and permanent wording
that completed tasks need no further action. Both `requestSimpleResponse` and
`requestComplexResponse` use this activity through their common request handler.
The public `/api/email-task-status` endpoint exposes only basic response status
and a UTC check time, never answers or recipient details. It uses the existing
`RESPONSE_TASK_SIGNING_KEY` on both worker and web; rotating that key invalidates
old badges. Status capabilities last until key rotation so completed tasks can
still be shown after their response link expires. The authenticated response
link retains its existing expiry.

Badges request no caching, but email clients can still retain or prefetch images.
The task page is authoritative. Supported response states are pending, completed,
and expired; the current task model has no cancelled state. Invalid tokens,
missing requests and service failures display “Status unavailable”. Existing
sent emails are unchanged; the badge appears on newly sent task emails.

### Outstanding-task digest

`taskDigestWorkflow` runs on the `district-task-digest-72h` Temporal schedule.
After deploying the updated worker, register it once with:

```sh
corepack yarn workspace @district/worker tasks:schedule
```

The registration uses the configured Temporal namespace and task queue, starts
its first run approximately 72 hours after registration, and repeats every 72
hours. Overlapping runs are skipped; rerunning registration leaves an existing
schedule unchanged. No initial digest is sent by the registration command.

Each run selects active users whose profile preference is `task-notification`.
It combines outstanding platform tasks and live legacy Training Fund actions
across their unambiguous directory email addresses into one themed email, sent
to the first address in alphabetical order (there is no primary-address field).
Recipient-specific responses take precedence over tag membership; completed,
expired response requests and tasks belonging to closed executions are omitted.
Empty digests are skipped. Response links open the response form; other tasks
link to Actions. The existing initial task notifications are unchanged.

Each recipient is a separate retryable activity that rechecks preferences and
assignments. Failures do not prevent subsequent recipients from being processed;
the workflow reports failure after processing the remaining recipients. SES
cannot guarantee exactly-once delivery after an uncertain network result, so an
activity retry can occasionally duplicate that recipient's email. Monitor failed
runs and repair the cause rather than replaying a whole digest manually.

### Response-link reminders

`responseRemindersWorkflow` is one scheduled scan for all users. It runs every
15 minutes and sends individual task emails for active, unambiguous recipients
whose current preference is `response-links` (including the default profile).
Only tasks with an explicit, finite expiry/deadline qualify for these individual
reminders; undated tasks are excluded. Both simple and complex response requests
are supported. The Task Notification roll-up remains unchanged. These emails retain
the original instructions, response choices/form link and shared status badge,
with a `Reminder:` subject and the preface “Remember, you have an action to
complete: [task heading]”.

The original successful SES dispatch is recorded on the response request.
Reminder one becomes due 72 hours after that dispatch; reminder two becomes due
72 hours after the first reminder attempt. The scanner introduces up to roughly
15 minutes of delay under normal operation. Delayed runs do not send catch-up
reminders together. Completion, expiry, a closed owning workflow, an inactive or
ambiguous recipient, or a switch to Task Notification prevents sending.

An atomic database claim reserves each of the two reminder slots before sending,
so concurrent scans and activity retries cannot exceed two reminder attempts.
SES does not provide an idempotency key or proof of receipt. A failed/uncertain
send consumes its slot and is reported as a workflow failure; do not reset slots
automatically. A crash between claiming and sending can therefore omit a reminder.
The original dispatch also retains the existing SES ambiguity if a process fails
between sending and recording its timestamp. Successful recorded originals are
not resent on activity retry.

Apply migration `0009_broad_killraven.sql`, deploy the updated worker, then register:

```sh
corepack yarn workspace @district/worker responses:schedule
```

Registration is idempotent and leaves an existing schedule unchanged. Historical
response requests have no dispatch timestamp and are deliberately not backfilled.
Legacy task emails outside the simple/complex response-request activities are not
eligible because their original dispatch and response definition are not recorded
in this table. Migration must precede worker rollout; no live schedule or database
is modified merely by adding this code.

### Member profile by membership number

`getMemberProfileByMembershipNumber(membershipNumber: string)` returns a member's
ID, name and current appointments (`role`, `team`, `email`), or `null` for an unknown
number. It uses the District Team `/api/member-profile/{membershipNumber}` endpoint
and the existing directory URL/authorization configuration. Failures other than
404 throw so the caller can choose a retry policy. It does not create tasks or
impose award-specific routing. See [Awards](awards.md) for its first consumer.
