# Staff workspace database preparation — 12 October 2026

Status: prepared and tested locally. Read-only live SQL access was restored;
the saved before-snapshot matches all nine unique original helper/RPC hash gates,
93 required columns and the expected policy inventory. This does not mean the
release has been applied. No production schema, role, profile or business row
was changed by preparation or local tests.

## Exact scope

- Migrations, in order:
  `supabase/migrations/20261012110000_staff_workspace_access.sql`, then
  `supabase/migrations/20261012111000_staff_documents_journals_access.sql`.
- Replace only two named legacy company policies with read/write policies and
  the eight named OT group/record policies. Keep company-own SELECT/UPDATE and
  restrictive account-deletion policies.
- Replace `org_role_default_permissions(text)` only to mirror the six existing
  frontend defaults. Changes: teacher gains its existing UI `library.read`;
  `sales_manager` receives exactly the existing UI role permissions.
- Replace `get_organization_core(uuid)` using its existing nine-field projection.
  Active staff membership is sufficient for shell metadata; expiry and account
  revocation deny access. Genuine learners retain their own-school metadata.
- Leave `current_organization_id()`, `get_user_role()`, global roles, profiles,
  existing owner identities and unrestricted organization SELECT unchanged.
- Replace the four confirmed document RPC authorization paths:
  `get_documents_kpi(uuid)`, `list_recycle_bin(uuid,text,integer,integer)`,
  `soft_delete_document(text,uuid)`, `restore_document(text,uuid)`. Reads require
  documents.read; proposal/billing recycle branches additionally require their
  domain read permission before count/pagination. KPI proposal fields are null
  without sales.read, with the corresponding UI displaying “Нет доступа”.
  Delete/restore require sales.write for commercial_proposals, billing.write for
  org_billing_documents, and documents.write for the remaining fixed allowlist.
- Fix two reproduced existing document lifecycle errors: dynamic EXECUTE did
  update documents but RETURN FOUND reported false (use ROW_COUNT); unqualified
  display_name in recycle SQL conflicted with the RETURNS TABLE parameter
  (qualify the existing CTE columns). Signatures, booleans, filters and pagination
  otherwise keep their contracts.
- Replace exactly the eight legacy journal_instances/journal_entries policies
  with journals.read/write; retain restrictive account-deletion fences.

## Preconditions and backup before any apply

1. Run `preflight.sql` and `preflight-documents-journals.sql` read-only and save all results on D. Check complete policy
   inventory, function definitions, roles, table RLS, table ownership and fields.
   The helper body hashes are a strict version gate, not approximate matching.
   A mismatch means stop and review the actual body, never remove the gate just
   to apply. In particular, `can_access_organization` must not treat arbitrary
   same-organization profiles as owners. The migration itself repeats this gate.
2. Run `backup-definitions.sql` and `backup-documents-journals.sql` and save the
   results. The six overwritten functions are exactly the two workspace
   functions and four document RPCs named above. Save definitions, owner and ACLs;
   function DDL alone omits grants. Save eighteen replaced policies and all
   retained policies. The four original document bodies have strict hash gates;
   a drift requires review, not overwriting newer live business logic.
3. Confirm that the twenty new/replacement policy names do not conflict with
   unrelated live policies. Review any extra permissive policies because they
   combine through OR. Do not drop them automatically. No API/database write
   grant is added to tables by this migration; authenticated table privileges
   must already exist, as on the current application schema.
4. Execute only `release-transaction.sql` as **one complete SQL editor request**.
   Never send BEGIN, migration or COMMIT as separate requests: the editor may
   assign different connections. The wrapper follows the already used S028/S029
   release mechanism: transaction-scoped release advisory lock, migration-ledger
   table lock, refusal when either version is present, exact-source integrity
   checks, execution of both original sources, and recording each exact source
   in the migration ledger. It checks all 41 postflight predicates, both ledger
   entries and unchanged definitions/policies/table security before COMMIT.
   Any error aborts all changes; independently inspect the ledger/catalog before
   retrying an ambiguous response. The earlier statement that this package must
   never write the ledger was incorrect: it missed this existing repository
   release workflow.
5. Save the final `release_result` and run both read-only postcheck files again.
   Only the completed batch's result plus fresh catalog/ledger checks establish
   the SQL release. Its PostgREST notification is transactional; delivery and
   application behavior remain separate checks.

Core RPC grants: revoke EXECUTE from PUBLIC and anon; grant authenticated and
service_role. It still requires `auth.uid()` plus authorization, so service-role
execution without an actor does not bypass the identity check. The defaults
function retains its prior ACL; it returns a static nonpersonal permission list.
The RPC reads no secret columns and does not grant settings.write.
The four document RPCs use the same PUBLIC/anon revoke and authenticated/service
execute grants, with explicit actor, domain and account-revocation checks before
SECURITY DEFINER reads/writes. They add no business-table grants.

## Verification and recovery

`node supabase/tests/test-staff-workspace-access.mjs` uses existing PGlite on D (override
`PGLITE_MODULE_PATH` when needed). It creates an empty isolated in-memory
PostgreSQL fixture, loads real helper bodies, applies the actual migration, checks
RLS as authenticated users, and rolls the whole transaction back. It has no
hosted URL, credentials or network database connection. Never paste
`synthetic-fixture.sql` or `regression-rollback.sql` into a live database.

Tests cover role/UI matrix parity, staff with a profile in another school,
authorized CRUD, cross-tenant denial, read-only grants, expired/revoked staff,
limited shell metadata, company owner and global administrator access, genuine
learner shell, and unchanged tenant-resolver/retained policy definitions.
The combined suite passes 127 SQL assertions, six full frontend/SQL role-matrix
checks, 41 read-only postflight checks and two preserved-definition checks. It
also reproduces both original false document results and the original recycle
SQL ambiguity before proving the corrected lifecycle, and rejects an unreviewed
permissive helper body. Tests remain synthetic; this is not a live release claim.

The atomic wrapper is generated by `supabase/tests/prepare-staff-atomic-release.mjs`
from the saved live metadata and checked-in sources. Its companion
`supabase/tests/test-staff-atomic-release.mjs` executes the **exact generated
batch** in disposable in-memory PostgreSQL, loading the actual before-function
and policy definitions with synthetic rows. It verifies successful COMMIT,
byte-for-byte source in two ledger rows, replay refusal, definition-drift
refusal, and complete function/ACL/policy/ledger rollback after an injected
failure on the second ledger insert. The final run also passes 127 role
assertions with the live policy inventory; ten untouched functions, fourteen
retained policies and six table-security definitions are preserved. The fixture
COMMIT is local only; subsequent synthetic business mutations are rolled back
and the in-memory database is discarded.

Private evidence lives under
`D:/Codex/work/sintagma-queue/work/s047-staff-invites-20261012/atomic-release/`:
`live-preflight-reconciliation.json`, `atomic-validation.json` and the exact
generated `staff-workspace-atomic-apply.sql`. The checked-in
`release-transaction.sql` must have the same SHA256 as that tested file.
Regenerate and retest after any source or wrapper change; do not update hashes
merely to accept a changed live definition. No npm dependency is installed.

After a real release, verify a fresh employee session: organization shell opens,
only permitted sections are shown, permitted lists contain that organization's
data, read-only staff cannot mutate, and a revoked/expired access no longer
works. Administrative impersonation does not prove this employee outcome.

For an already committed rollback, use the saved BEFORE function definitions
and ACLs, drop only the four new company staff policies, and restore exactly the
two old company policies and eight old OT policies. Keep all unrelated policies.
For the second migration, restore only the four saved document RPC definitions
and ACLs and eight saved journal policies.
Restore the core ACL by removing grants introduced by this migration and replaying
the saved grant inventory. Do not reconstruct live definitions from an old repo
when an exact before-backup is available.
