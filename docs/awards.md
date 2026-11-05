# Awards

Open Workflows → Awards → Form. Upload CSV or `.xlsx` (first sheet), up to 500 awards and 2 MB. Required headers are `Membership number`, `Award description`, `Award date` (case-insensitive; underscores also accepted). Dates can be Excel date cells, `YYYY-MM-DD`, or `DD/MM/YYYY`. Blank rows are skipped; invalid rows and duplicates within a file reject the upload before starting a workflow. Legacy `.xls` files must be saved as `.xlsx` first.

The import starts a durable `awardsWorkflow`. Each row calls the reusable `getMemberProfileByMembershipNumber` activity. This calls `/api/member-profile/{membershipNumber}` relative to `DISTRICT_TEAM_MEMBERS_URL`, using the existing `DISTRICT_TEAM_AUTHORIZATION` setting. It returns `{ id, name, appointments: [{ role, team, email }] }`, or null for a 404. Network/server failures are retryable. The activity has no award or assignment logic.

Matched rows create one platform `Present Award` task assigned to the users returned by `resolveRoleUser('DLV')`, with no deadline. Appointment information is a snapshot at import time. Unmatched/failed lookups are reported by spreadsheet row number without preventing other rows from importing; correct and reimport only the failed rows. Retrying the same upload request is idempotent. Selecting/reimporting a file starts a new import; do not reimport successful rows.

DLV members can manage all outstanding award tasks. An assigned individual can also manage their task. Reassignment selects an active district member, or the initial resolved users to restore its original assignment. Reassignment and completion are recorded as append-only task submissions. Presented awards remain available in task history. Tasks appear under Actions and in applicable task digests; individual assignments override tag delivery. The workflow waits for completion signals, with no expiry or per-award timers.

Before use: apply all database migrations, sync the DLV tag and members, install the reminder schedule described below, and restart the web app and worker. The web app requires Temporal connectivity to start imports; the worker needs District Team connectivity for enrichment. Any authenticated workflow registrar may import, consistent with Training Fund registration.

## Award lifecycle and reminders

Each award now uses the authoritative XState lifecycle: **Award listed → Award
received → Presentation scheduled → Award presented**. The repository validates
all transitions through the same machine displayed on the Definition page.
Existing outstanding awards migrate to listed; completed awards remain presented.
Select any number of listed awards in Tasks (including “select all” for the current
filters) and mark the box received in one atomic transaction. Receipt is audited
per award. Then schedule each received award with a calendar date and mark it
presented once the presentation happens. You may reschedule or reassign an open
award. Invalid or unauthorised batch selections make no changes.

Reminder scans run every 15 minutes. They send on the date three calendar days
before presentation, and on presentation day, at or after **09:00 Europe/London**
(DST-aware). Dates scheduled less than three days ahead do not generate a late
three-day reminder. On-day schedules made after 09:00 are picked up by the next
scan. No reminders are sent after presentation day. If a scan is unavailable for
an entire reminder day, that reminder is missed, rather than sent on a wrong date.

The current individually assigned active member receives reminders. For an initial role-based assignment, each reachable user saved from
`resolveRoleUser('DLV')` receives one at their resolved appointment email. Recipients are
rechecked when claiming delivery. Rescheduling increments a schedule revision,
invalidating unclaimed old-date reminders. Concurrent scans and retries share a
unique claim per award/revision/offset/recipient. As with the existing SES reminder
system, uncertain delivery consumes its claim to avoid duplicate emails; inspect
`award_reminders.status` for `uncertain` or stranded `claimed` deliveries. A change
after an email has been claimed cannot retract that email.

There are **no per-award timers** and no need for separate Temporal workflows for
every human step. The import workflow waits passively for `awardsProgressChanged`
and rechecks completion. Database transitions signal it after commit. The shared
scan repairs missed completion signals. A Temporal patch preserves replay for
older polling executions, which switch to signal waiting on their next live loop.

Apply migration `0011_busy_spiral`, rebuild/restart web and worker, and run
`yarn workspace @district/worker awards:schedule` with the worker environment to
install the shared schedule. This command is idempotent. It uses the existing SES
and `PUBLIC_APP_ORIGIN` settings. The schedule must be installed in each deployment.

## Resolved award assignees

`DLV` is a lookup tag, not an assignee. New imports invoke the reusable Temporal
`resolveRoleUser('DLV')` activity once and persist all returned user IDs, names and
appointment emails on each award. Multiple users share the same award task;
completing it once completes it for everyone. Empty resolution rejects the workflow
with an explicit missing-assignee error. Role assignments are snapshots; subsequent
tag membership changes do not silently replace an award's assignees.

Manual reassignment overrides the initial user set. Restoring the initial assignment
restores those resolved users, not a dynamic tag. Reminders and digests use the
resolved users and appointment emails (one reminder per distinct user), and the UI
shows their names. DLV members retain existing management access separately from
assignment.

Apply migration `0012_cheerful_living_mummy` and run
`node --import tsx src/commands/backfill-award-assignees.ts` from the worker directory
to populate legacy assignments using the same resolver. The repair only fills
missing role assignments and preserves individual overrides. Restart the worker
to load the patched workflow; existing histories remain replay-compatible.
