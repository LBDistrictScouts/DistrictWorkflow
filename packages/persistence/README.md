# Application persistence

PostgreSQL stores Training Fund applications independently of Temporal history.
Drizzle defines the schema and queries; Drizzle Kit generates reviewed SQL migrations.
Only application services and activities may access this package. Workflow code
imports its activity contract with `import type`; it never opens a database connection.

## Local setup

Use your installed PostgreSQL server. On this Mac, PostgreSQL 18 listens on port
5433; port 5432 belongs to PostgreSQL 14. The examples use port 5433. Create an application database and choose a
login role that owns it. For example, using an administrator connection in `psql` on your selected server:

```sql
CREATE ROLE district LOGIN PASSWORD 'local-development-only' CREATEDB;
CREATE DATABASE district_workflow OWNER district;
```

`CREATEDB` allows the local test harness to create disposable databases. A production
application role should not have that privilege. If you already have a suitable
local role/database, use those instead of creating duplicates.

Copy `.env.example` to `.env` in this package, and copy the web/worker examples to
`apps/web/.env.local` and `apps/worker/.env`. Set the same `DATABASE_URL` in all three,
using your actual host, port, username and password. For example:

```dotenv
DATABASE_URL=postgresql://district:local-development-only@127.0.0.1:5433/district_workflow
TEST_DATABASE_URL=postgresql://district:local-development-only@127.0.0.1:5433/postgres
```

Set `TEST_DATABASE_URL` in this package's `.env` for repository tests and in
`apps/worker/.env` for Temporal integration tests, or export it in your shell for
both. Use an administrative database such as `postgres`; tests create their own
unique databases and do not migrate this administrative database.

From the repository root:

```sh
corepack yarn db:migrate
corepack yarn build
```

`db:migrate` uses this package's `.env`, or a `DATABASE_URL` supplied by the deployment
environment. Connections are lazy and pooled. TLS is configured through the
PostgreSQL connection string; production credentials remain server-side.
Docker is optional; see the container commands below.

## Tables and consistency

- `training_fund_applications`: one immutable submission identity, stable workflow
  ID, latest status/revision, submission time and typed JSON snapshot.
- `training_fund_transitions`: append-only snapshots keyed by application ID and
  revision. Approval identities/timestamps and payment details are retained here.

Revision 0 is initialization, revisions 1–3 are approvals, and revision 4 records
payment for the current process. Each write locks the application row and commits
the latest snapshot and audit entry in one transaction. Repeating the same revision
and snapshot is a no-op, even after newer writes. Reusing a revision with different
content, skipping revisions or changing submission/routing data is rejected.

The consumer starts new executions with `{ persistState: true }` as a third
workflow argument. That path persists initialization before notifying reviewers,
serializes decisions, and waits for each database commit before completing an
Update. A lost commit receipt is safe to retry. Database connectivity failures
remain retryable; immutable-data conflicts are non-retryable activity failures.
Existing two-argument histories continue without database writes. They require an
explicit backfill before they gain ledger/archival protection.

SQS remains the durable submission buffer: HTTP 202 means queued, not already
written to PostgreSQL. The consumer checks the ledger before starting a workflow,
and acknowledges only after a known existing record or successful Temporal start.
A start accepted before the initial database write is protected by Temporal history;
the first activity retries until persistence succeeds. For persisted applications,
later redrives cannot restart the process after Temporal history expires. Reused
application IDs with changed payloads fail rather than silently replacing records.
For staff HTTP retries, only the freshly stamped `registeredAt` value is ignored
when comparing duplicate submissions; the original timestamp stays in the ledger.

Live task queries still use Temporal. If its history is gone, the web adapter can
read a completed (`paid`) snapshot from PostgreSQL; pending executions are not
silently reconstructed. A Temporal service outage is not treated as purged history.
The ledger records decisions and references; it does not execute bank transfers.

## Migrations and verification

Edit `src/schema.ts`, then run root `corepack yarn db:generate --name=<change>`.
Review and commit the SQL and generated metadata in `migrations/`. Deploy committed
migrations with `db:migrate` before new consumers/workers. Never auto-migrate during
web/worker startup. The migration runner uses a dedicated advisory-locked session
to serialize concurrent deployments. Keep existing migrations immutable after use.

Use a deployment role for DDL. The runtime role needs SELECT/INSERT/UPDATE on the
application table and SELECT/INSERT on transitions; it should not update/delete
audit entries. Backups, retention/access policies, archival exports and deployment
credentials must be configured for the production environment.

With your PostgreSQL server running and `TEST_DATABASE_URL` configured:

```sh
corepack yarn test
corepack yarn test:integration
```

Every database test creates a uniquely named database, applies the committed SQL
migrations and drops only that database afterward. Tests use the production
node-postgres driver and connection pool, including separate sessions for competing
writes. No test migrates or clears the application database. `TEST_DATABASE_URL` is
required and its role must have CREATEDB permission. There is no implicit Docker
endpoint or fallback to `DATABASE_URL`.

Tests cover repeated migration application, retries, conflicts, SQL constraints,
transaction rollback and completion. Temporal integration tests cover concurrent
approvals, lost commit receipts and replay against the same PostgreSQL repository.

## Optional Docker services

These are conveniences for machines without a local PostgreSQL installation:

```sh
corepack yarn db:docker:up
corepack yarn db:docker:down
corepack yarn db:test:docker:up
corepack yarn db:test:docker:down
```

The application service defaults to host port 5432 and keeps its named volume. Set
`POSTGRES_PORT` if that port is occupied. The test service defaults to port 55432
and uses ephemeral storage; set `POSTGRES_TEST_PORT` to change it. Both containers
listen on port 5432 internally. Configure connection URLs for the selected service.
For Docker tests, use:

```sh
export TEST_DATABASE_URL=postgresql://district_test:test-only@127.0.0.1:55432/postgres
```
