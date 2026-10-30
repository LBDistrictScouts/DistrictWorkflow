# DistrictWorkflow worker

The independent TypeScript process hosts Temporal workflow definitions and
activities. Separate entry points handle SQS intake and operator commands.
Install and build through the [root workspace](../../README.md).

```text
src/
  workflows/                  Deterministic orchestration and workflow registry
    training-fund/workflow.ts
    greeting/index.ts
  activities/                 Registered side effects; preserve activity names
    email-notifications/      Email activities and Training Fund message content
  intake/training-fund.ts      SQS consumer process
  commands/resend-training-fund.ts
  worker.ts                   Worker registration and shutdown
  client.ts                   Greeting example client
```

XState machines are in `packages/domain`, schemas and wire types in
`packages/contracts`, use cases in `packages/application`, and environment,
Temporal-client, email-delivery and signing adapters in `packages/integrations`.
Workflow modules import only deterministic code and type-only activity contracts.

From this directory, after the root install and `build:packages`:

```sh
corepack yarn setup:cli
corepack yarn server
```

In separate terminals, use `corepack yarn dev` and
`corepack yarn training-fund:consume`. Copy `.env.example` to `.env` and configure
routing as described in [Training Fund operations](../../docs/training-fund.md).
The web application owns the HTTP endpoints; the former `training-fund:api`
process is retired.

The dev server binds to loopback at `localhost:7233`, with its UI at
http://localhost:8233 and persisted history at `.data/temporal.db`. This server is
for local development. Use Temporal Cloud or a production cluster in deployment;
select a worker versioning strategy and prebundle workflows for production.

`build` cleans `dist/` before compiling. `start` runs `dist/worker.js`; intake is
`dist/intake/training-fund.js`. Preserve the registered workflow, activity, query
and update names when moving files so existing histories replay unchanged.

`training-fund:resend <application-uuid> <person-id>` sends a real email to an
outstanding assignee. `email:preview` renders fictional samples under
`.data/email-previews/` without sending mail. See [reusable activities](../../docs/reusable-activities.md).

New consumer starts persist Training Fund decisions through database activities.
Configure `DATABASE_URL` and apply [database migrations](../../packages/persistence/README.md)
before enabling intake. Existing two-argument workflows retain their original behavior.
