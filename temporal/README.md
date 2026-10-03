# DistrictWorkflow Temporal backend

Standalone TypeScript worker, workflow, and client. The example workflow calls a
retryable greeting activity. Replace or extend these with application logic.

## Setup

```sh
cd temporal
nvm install
nvm use
corepack yarn install --immutable
yarn setup:cli
```

Yarn 4.18.1 is pinned in `package.json`. Enable the `yarn` command with
`corepack enable`, or use `corepack yarn` in place of `yarn` below. Dependencies
use the standard `node_modules` layout.

Node 24 is selected by `.nvmrc`; the setup commands use nvm to install and activate
it. If you use another Node version manager, select Node 22 or 24 before running
Yarn. The CLI installer supports macOS and Linux and
installs the current Temporal CLI in `.bin/` without changing your system PATH.

## Run locally

In separate terminals, from this directory:

```sh
yarn server
```

```sh
yarn dev
```

```sh
yarn workflow Jacob
```

The client prints a workflow ID and `Hello, Jacob!`.

- Temporal endpoint: `localhost:7233`
- Web UI: http://localhost:8233
- Namespace: `default`
- Task queue: `district-workflow`

The server binds to loopback and persists workflow history in `.data/temporal.db`.
Stop the worker and server with Ctrl+C. Restart them with the same commands to
continue processing persisted workflows. The CLI dev server is for local
development only; use Temporal Cloud or a production cluster for deployment.

## Configuration

Copy `.env.example` to `.env` to customize worker/client connection settings.
For Temporal Cloud, supply your namespace, address, and API key; API key
configuration automatically enables TLS. Never commit `.env`.
The `server` script always runs a local development server with its own defaults.

## Commands and structure

- `yarn typecheck`: check TypeScript.
- `yarn build`: compile to `dist/`.
- `yarn start`: run the compiled worker after building.
- `src/workflows.ts`: deterministic workflow orchestration.
- `src/activities.ts`: side effects and external integrations; keep them idempotent.
- `src/worker.ts`: workflow/activity registration and graceful shutdown.
- `src/client.ts`: example of starting and awaiting a workflow.
- `src/config.ts`: shared environment configuration.

The sample client uses unique execution IDs and a one-minute execution timeout.
For business workflows, choose stable IDs and timeouts appropriate to the job.
Before production deployment, prebundle workflows with the SDK bundler, configure
credentials and observability, and choose a worker deployment/versioning strategy.

References: [Temporal TypeScript SDK](https://github.com/temporalio/sdk-typescript)
and [Temporal documentation](https://docs.temporal.io/develop/typescript).
