# DistrictWorkflow

Next.js serves the application and APIs. XState defines task transitions. Temporal
runs durable processes in a separate worker. Yarn workspaces share contracts,
business logic and infrastructure adapters between the two applications.

```text
apps/
  web/                     Next.js pages, APIs, authentication and composition
  worker/                  Temporal workflows, activities, SQS consumer and commands
packages/
  contracts/               Serializable types, JSON Schema and input validation
  domain/                  Pure XState machines and task decision rules
  application/             Use cases and dependency interfaces
  integrations/            Temporal client, AWS delivery, signing and configuration
  persistence/             PostgreSQL/Drizzle ledger, migrations and repositories
docs/                      Architecture and operations
infrastructure/            Infrastructure definitions
```

## Development

Use Node 24 (see `.nvmrc`) and Yarn 4.18.1 through Corepack. Install once at the
repository root:

```sh
corepack yarn install --immutable
corepack yarn build:packages
```

Copy `apps/web/.env.example` to `apps/web/.env.local` and
`apps/worker/.env.example` to `apps/worker/.env`. Configure sessions, SQS, signing
and recipients as described in [Training Fund operations](docs/training-fund.md).
Next.js connects directly to SQS and Temporal; the former private HTTP API,
`TRAINING_FUND_API_URL` and `TRAINING_FUND_API_KEY` are retired. Never expose AWS,
Temporal or signing credentials through `NEXT_PUBLIC_` variables.

Configure PostgreSQL and apply the migration using the
[database setup guide](packages/persistence/README.md) before starting new intake.

### WebStorm: one-click development

Select **DistrictWorkflow Local Dev** in WebStorm's Run configuration dropdown and
click Run. The web app opens at **http://localhost:3030**. The shared configuration is stored in `.idea/runConfigurations/Local_Dev.xml`.
The equivalent terminal command is:

```sh
corepack yarn dev
```

The launcher selects the installed Node 24 executable directly (including nvm and
Homebrew installations), checks your existing
PostgreSQL connection, builds shared packages, applies committed migrations and
starts Temporal, the worker and Next.js in order. It assumes PostgreSQL and Docker
are already running and does not manage either service. An existing local Temporal
server is reused; otherwise it starts the persisted development server.

Next.js uses `next dev` with hot reload. Shared TypeScript packages rebuild in watch
mode; the Temporal worker and configured SQS consumer use `tsx watch`, including
changes to compiled shared packages. The initial build/migration runs once per
launch. Restart the launcher after changing environment settings, dependencies or
database migrations. Use Stop in WebStorm (or Ctrl+C) to stop all processes started by the launcher;
an existing Temporal server and PostgreSQL are left running.

SQS intake is included when `TRAINING_FUND_QUEUE_URL`, routing, the shared signing
key and sender settings are configured. Until then the launcher reports intake as
disabled. Member/staff session validators and AWS integrations still use their
configured services; the launcher does not create substitute authentication or AWS
services. Never put secrets in the shared run configuration.

Run `corepack yarn dev:check` for a preflight without starting application processes.
The individual Front End and Temporal Workflows configurations remain available.

Run the following in separate terminals at the repository root:

```sh
corepack yarn workspace @district/worker server
corepack yarn dev:worker
corepack yarn workspace @district/worker training-fund:consume
corepack yarn dev:web
```

Install the local Temporal CLI once with
`corepack yarn workspace @district/worker setup:cli` if necessary. The local
Temporal database remains under `apps/worker/.data/`; existing runtime data and
routing files move with the worker directory. Update external launchers and any
absolute routing-file paths that referred to the old `temporal/` directory.

Shared packages run from compiled `dist/` exports. The all-process launcher rebuilds
them automatically. When using individual commands, rebuild them with
`corepack yarn build:packages` after edits. No package imports another application's source.

## Verification and deployment

```sh
corepack yarn typecheck
corepack yarn test
corepack yarn lint
corepack yarn build
corepack yarn workspace @district/worker test:integration
corepack yarn test:web
```

Use your local PostgreSQL server and configure `DATABASE_URL` consistently in web,
worker and migration environments. Database tests require an explicit
`TEST_DATABASE_URL` with CREATEDB permission; each test creates and drops its own
database. Docker is optional: see the [database guide](packages/persistence/README.md).

The integration and web tests require a production web build; Temporal integration
tests use `apps/worker/.bin/temporal`. Tests use local SQS/session stubs and mock
email delivery; they do not send real email or call AWS.

`corepack yarn test:integration` builds everything and runs the Temporal/API suite.
For deployment, install from the root lockfile, build the workspace, then run
`corepack yarn workspace @district/web start` and
`corepack yarn workspace @district/worker start` as independent services. The SQS
consumer runs separately with
`node apps/worker/dist/intake/training-fund.js` from the repository root; supply its
configuration through the deployment environment (or run from `apps/worker` to load
its `.env`). Include built shared packages and workspace dependencies in both deployments.

See [architecture](docs/architecture.md) for dependency rules and the planned
PostgreSQL/Drizzle persistence boundary. See [database setup](packages/persistence/README.md)
for local startup and migration commands.
