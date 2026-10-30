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
