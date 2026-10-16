# Legacy CRM organization isolation — 16 October 2026

> The final coordinated release is [payment-access-ui-20261016](../payment-access-ui-20261016/README.md). This directory documents one component; its standalone SQL is reference material. Do not apply it separately when using the coordinated release.

Prepared locally; not applied to production. Migration:
`20261016140000_legacy_crm_access.sql`.

## Problem and behavior

The organization-staff compatibility trigger creates a `sales_managers` row so
older proposals/contracts can retain a manager ID. Broad permissive policies
mistook that row for platform-wide sales authority. Profile-first organization
policies also allowed ordinary learners and expired/read-only staff to mutate
the legacy CRM. Replacing the UI with `org_crm_*` did not remove those API paths.

The replacement policies on `sales_leads`, `sales_tasks` and
`sales_lead_activities` use three separate scopes:

- Platform administrator: all scopes, subject to account revocation.
- Explicit platform sales manager: `organization_id IS NULL`, retaining the
  latest policy's read/write access to platform CRM records. Explicit identity
  means global `user_roles.sales_manager` or `admin_staff.role=sales_manager`,
  together with an active manager profile and no account revocation.
- Organization owner/staff: the exact organization and canonical
  `can_access_organization(..., sales.read|sales.write)`, including membership
  expiry. A compatibility manager profile alone grants nothing.

The public helper `is_platform_sales_manager(_uid uuid)` checks the explicit
actor and can be used by service-role handlers after they authenticate that
actor. `is_active_sales_manager(uuid)` remains a compatible alias. Neither
function is available to anonymous callers.

The org-staff trigger retains IDs and considers remaining eligible memberships
when one is removed or expires. Organization edits cannot activate/deactivate
an independently managed platform sales identity. No existing rows are updated
by the migration itself. Passing time is enforced by the access checks even
when no trigger has run to refresh a compatibility row.

A read-only live schema snapshot on 16 October matched the expected 18
permissive policies and three retained account-deletion policies on these
tables. The retrieved canonical access/owner helpers and old CRM RPC/trigger
definitions matched the tested model. This is a schema check, not a production
execution of the migration or a live cross-tenant request.

`list_org_task_assignees` requires read permission for the requested organization
and excludes expired/revoked members and revoked owners. Its return signature
remains unchanged. `claim_sales_leads` only claims unassigned `new` platform
leads (up to the existing UI's 2,000-row batch), writes the supported
`status_change`/`description` event from `UPDATE ... RETURNING`, and returns zero
without another log on replay. Failure to write the activity rolls back the
claim. Organization lead IDs are never claimed through the platform pool RPC.

The activity scope trigger now derives organization from the referenced lead,
instead of assigning the caller's profile organization to platform activities.
The lead scope trigger preserves an omitted platform scope for explicit platform
actors even when their profile has an organization; organization UIs continue
to pass their scope explicitly. Other sales auto-fill triggers are unchanged.
Contradictory non-null input is rejected. Task/activity RLS also requires a
same-scope lead; unlinked tasks remain supported. Write-only staff need a read
grant to target linked records, consistent with the application's read/write
permission model.

## Preservation and release procedure

No new `org_crm_*` table/function, global role, profile, manager ID, business row,
table grant, or account-deletion policy is changed. Other sales domains such as
proposals, contracts, blacklist and imported company directory are outside this
package; this is not a complete certification of every legacy sales API.

Before applying, save exact function definitions/ACLs, policy definitions and
all three changed trigger definitions. Compare the deployment's helpers, table
schema and policy inventory with the reviewed revision. The migration refuses
unknown permissive policies instead of silently deleting them. Inspect existing
task/activity-to-lead organization mismatches read-only: mismatched records are
not rewritten and will not be shown through the new scoped policy until a
separate authorized data repair is designed.

Apply the entire migration as one transaction through the normal migration
ledger workflow. Any failure must roll back; do not weaken the preflight to
accept unexplained live drift. For a committed release, prefer a forward fix.
Restoring the previous broad policies would reopen the issue and is not an
automatic rollback operation.

## Isolated verification

`supabase/functions/_shared/legacy-crm-access.test.ts` uses installed PGlite and
the actual historical sales schema/policies plus current canonical permission
helpers from the repository. It first reproduces foreign/platform visibility
and foreign assignee access, then executes the exact migration. Fixtures are
synthetic, held in memory, with no network/credentials or production connection.

Coverage includes tenant A/B and platform isolation; owner, read-only, learner,
expired, revoked, inactive and orphan identities; an `admin_staff` platform
manager without a global sales role; same-tenant CRUD and child links; preserved
new CRM/security witnesses; org-trigger compatibility; claim replay and
transaction rollback on log failure. An injected failure before migration
COMMIT verifies all preceding function/policy/trigger changes roll back. An
unexpected permissive policy causes a preflight refusal.

The normal Vitest include discovers this Node-environment suite:

```text
npm test -- supabase/functions/_shared/legacy-crm-access.test.ts --maxWorkers=1
```

Local result on 16 October 2026: all 23 tests passed using Node 20.20.2,
Vitest 4.0.18 and PGlite 0.5.10 (2.82 seconds including setup), including the
platform lead insert path after the scope-trigger compatibility adjustment.

This suite does not simulate truly concurrent PostgreSQL connections. Concurrent
claim safety relies on PostgreSQL's UPDATE predicate recheck after row-lock
waiting; real multiconnection/staging acceptance remains a separate release
check. A passing synthetic suite does not confirm the deployed gateway/RLS or
the end-user browser workflow.
