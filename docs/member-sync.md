# District member sync

The worker imports the district-team paginated /api/members collection, including
member_contact_methods. Configure DISTRICT_TEAM_MEMBERS_URL and, if the gateway
requires it, DISTRICT_TEAM_AUTHORIZATION in the worker environment.

Apply migrations with `corepack yarn db:migrate`, start the worker, then run
`corepack yarn workspace @district/worker members:schedule` once per Temporal
namespace. This creates a persistent schedule at 03:00 Europe/London (DST aware)
and triggers an initial import. Re-running leaves an existing schedule unchanged.
The schedule skips overlapping runs; failed activities retry up to three times.
No schedule is registered merely by building or starting the application.

Users retain the district-team member UUID across email changes. All Email,
Email Alias and Email Group contacts are normalized by trimming and lowercasing.
Shared addresses are retained but cannot identify a user. Cognito signature,
issuer, audience and environment group validation still apply; a verified JWT
email must match exactly one active member. Different Cognito subjects with two
emails belonging to the same member resolve to the same userId.

A complete validated snapshot is applied atomically. Missing members are retained
as inactive; removed addresses stop matching. Failed API fetches or database writes
preserve the previous snapshot. Login requires the first successful import, so
migrate and import before deploying the web changes. A directory outage does not
erase previously imported users. Existing training-fund task permissions remain
based on the email specified in the application routing.

The source API does not provide snapshot pagination: count changes and duplicate
IDs are rejected, but same-count changes during pagination may only reconcile on
the next daily run.
