# DistrictWorkflow web application

Next.js App Router serves pages and APIs. Route handlers enforce sessions and
origin checks, then invoke `@district/application` use cases with adapters from
`@district/integrations`. Next.js connects to SQS and Temporal directly; there is
no separate private HTTP API.

Install dependencies at the [repository root](../../README.md). Copy `.env.example`
to `.env.local`, then run `corepack yarn dev:web` from the root. The application is
available at http://localhost:3030.

The member form lives at `/workflows/training-fund`; authorised staff can register
applications at `/workflows/training-fund/register`. Personal signed email links
open `/tasks`. Both forms use the same validation, SQS intake and durable workflow.
See [Training Fund operations](../../docs/training-fund.md) for configuration.

The visual language comes from `district-site`: Nunito Sans, district logos,
teal/green colours and light/dark themes. Assets are local; this app has no runtime
dependency on the reference checkout. No payment transfer is initiated by the app.

Run root `typecheck`, `lint`, `test`, and `build` commands for validation.
Completed task snapshots can be read from PostgreSQL after Temporal history expires.
Configure `DATABASE_URL` using the [database guide](../../packages/persistence/README.md).

Cognito sign-in protects all frontend pages and API routes (including signed task
links, which still require their task token). Set `WORKFLOW_ENV` explicitly, for
example `dev` requires the exact `cognito:groups` entry `workflow-dev`. There is no
fallback to `NODE_ENV` or the old workflow session validator. Group members can
register applications; the separate member-session check still applies to member
submissions.

Configure `COGNITO_DOMAIN` as the HTTPS managed-login domain,
`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, and optionally
`COGNITO_CLIENT_SECRET` in `.env.local`. Set `PUBLIC_APP_ORIGIN` to the public
origin. In the Cognito app client enable authorization-code grant and the
`openid`, `email`, and `profile` scopes. Allow callback URL
`{PUBLIC_APP_ORIGIN}/auth/callback` and sign-out URL
`{PUBLIC_APP_ORIGIN}/sign-in`. Assign users to `workflow-{WORKFLOW_ENV}`.

Sign-in uses authorization code + PKCE, state, and nonce. The server checks the
JWT signature against the pool JWKS, issuer, audience, expiry, ID-token use and
group on every protected request. The ID token stays in an HttpOnly, SameSite=Lax
cookie (Secure on HTTPS). Sessions renew on protected requests within 60 seconds of ID-token expiry, including
after an idle period. Refresh tokens stay in an HttpOnly, SameSite=Lax cookie
(Secure on HTTPS), with 30-day browser retention. Cognito enforces its configured
refresh-token lifetime; expired/revoked tokens require sign-in. Renewal validates
the signed subject, workflow group and active directory membership again, and
retains rotated refresh tokens. Existing sessions need one new sign-in to obtain
a refresh token. Group changes take effect when the existing token expires. Sign out clears
both local session cookies and redirects through Cognito logout.

`/actions` lists outstanding workflow tasks for the signed-in account. Training
Fund assignments match the authenticated email against
routing email addresses, ignoring case and surrounding whitespace. SAML profiles
asserted by the configured Cognito pool do not require `email_verified: true`;
other profiles do. All sessions require a unique active directory member match. Approvals
already given, payment tasks before approval, and completed workflows are hidden.
PostgreSQL selects candidate assignments and Temporal confirms their current
state. Loading fails visibly if either service is unavailable. Task links last
15 minutes; refresh Actions to obtain a new link. Existing email task links still
work. Future workflow types should add their own task providers to this page.
