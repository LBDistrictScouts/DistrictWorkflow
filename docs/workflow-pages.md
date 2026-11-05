# Workflow pages

Awards and Training Fund share the following routes:

- `/workflows/{slug}` — detail landing page, visible workflow-run/task counts, open/completed task metrics, and links to the three subpages.
- `/workflows/{slug}/form` — initiation form. Training Fund defaults to staff registration; `?mode=member` preserves member applications.
- `/workflows/{slug}/definition` — XState diagram and a transition table derived from that same graph. The Training Fund diagram retains its note about planned steps not yet integrated into the running workflow.
- `/workflows/{slug}/tasks` — current and historical tasks, with text search, status/assignee filters and date/recipient/assignee/status sorting. Awards retain their reassignment and completion controls inside task details.

Training Fund counts and lists show all reviewer/payment assignments for the workflow, while executable action links remain restricted to the signed-in assignee; approvals rendered unnecessary by a majority are shown as “No longer required”. Awards show DLV's managed tasks or the current individual's assignments. Completed tasks remain searchable. Counts represent persisted tasks, so an import still enriching recipients can take time to appear. Training Fund task links are checked against live workflow state.

The previous `/workflows/training-fund/register` URL redirects to `/workflows/training-fund/form`.

## Workflow ID convention

New business workflow IDs use `<workflow-code>-<UUID>`. Generate the UUID once for
an initiation request and retain it on retries; never generate a new UUID for
an HTTP retry. Use `workflowIdForUuid` from the contracts package for new workflows.
Training Fund already uses `training-fund-<application UUID>`. Awards now uses
`awards-<import UUID>` and rejects reuse of an import UUID with different data or a
different submitting user. Existing hash-based awards executions remain queryable
and are not renamed. Recurring system workflows retain their stable schedule IDs.

## Shared task modal

A single `TaskModal` host in the root layout handles same-origin award task links,
Training Fund task links and response links. Actions cards, workflow tables and
direct notification URLs resolve through the same task-reference parser and
renderers. Existing award `#task-<UUID>` links remain supported. Token-based links
are cleared from the address bar after opening; tokens are held only in memory.

The native dialog provides modal focus handling and Escape dismissal. The user
can also close it with the close button or backdrop. The originating page stays
in place. Successful changes refresh server listings and emit `task-updated` for
client-side listings. Awards use a shared detail renderer with Recipient,
Presentation and Assignees panels; task controls are no longer embedded in tables.

The shared Assignees panel now lists assigned people with individual Remove
buttons and a name-search field for adding active members. Existing assignees are
excluded from search results. Add/remove operations are audited and update the
saved assignment set used by task visibility, reminders and digests. The last
assignee cannot be removed; server-side row locking enforces this even across
concurrent requests. Editing a legacy single-user override first materialises it
as the current assignment set. Completed tasks remain read-only.
