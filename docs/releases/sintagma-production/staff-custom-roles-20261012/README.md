# Custom-role management for authorized employees

The existing `org_custom_roles` owner policy requires a global organization/admin role, so an active employee with `staff.write` cannot create or edit custom roles. Its separate read policy admits any historical staff membership, including expired membership and roles without `staff.read`.

Migration `20261012123000_org_custom_roles_staff_permissions.sql` replaces exactly those two permissive policies with authenticated SELECT/INSERT/UPDATE/DELETE policies using the established `can_access_organization` helper. SELECT requires `staff.read`; writes require `staff.write`. UPDATE checks both the original and resulting organization. The existing restrictive account-deletion policy is retained. Organization owners and platform administrators continue through the canonical helper.

No helper, business row, employee permissions, global role, owner identity, table ACL or trigger is changed. Personal employee grants are a separate authorized operation; this migration does not grant anyone additional permissions. Billing and organization selection are outside this change.

## Verification

Run from the repository with Node and the existing PGlite installation; `PGLITE_MODULE_PATH` may point to another installed copy. No new npm dependency is required.

```powershell
node supabase/tests/prepare-custom-roles-release.mjs
node supabase/tests/test-custom-roles-access.mjs
```

`validation.json` records 45 passing assertions and seven catalog postchecks. The test reproduces the original writer denial and expired-member read, then verifies employee CRUD, read-only access, teacher defaults, anonymous/student/revoked/expired denial, owner/admin access, cross-organization isolation and UPDATE tenant-change refusal. Synthetic business changes are rolled back.

The exact generated release transaction is also executed in disposable in-memory PostgreSQL: source is recorded byte-for-byte in the migration ledger; replay, helper drift and unexpected policies are rejected; an injected ledger failure rolls back preceding policy DDL. Table security, triggers and all eight dependency functions plus the timestamp helper remain identical. This does not prove hosted deployment or the actual employee browser workflow.

## Authorized release

1. Save the read-only `backup-definitions.sql` output outside the repository. Run `preflight.sql`; all catalog assertions must pass and `version_absent` must be true. The expected policies and helper bodies were compared with authenticated production metadata on 2026-10-12. The prerequisite bodies include the already released `20261012110000` defaults matrix.
2. Send **all of `release-transaction.sql` in one SQL-editor request**. It uses the existing repository release pattern: transaction, advisory lock, migration-ledger lock, replay guard, exact source hash, DDL, exact-source ledger insertion, asserting postchecks, schema reload notification and commit. Splitting requests may use different database connections. Any error requires rollback; never continue individual fragments.
3. Save the returned `release_result` (`committed=true`, `checks_passed=7`, `preserved_security=true`, `ledger_source_match=true`). Run `postcheck.sql` again and independently verify the ledger source. Confirm custom-role controls in the employee session. Creating test roles in a real organization is not part of the isolated checks.

Migration normalized MD5: `dd609593689dfe69fac6a00431464824`.

Release transaction SHA-256: `f7dbb3b641ccf98b09765a8b1b59cfdf90c0f066d5dfcfefa2d22695ff70d44c`.

Only the release owner applies this package. At preparation time production application and browser acceptance remain unverified. This package does not deploy Edge functions or the frontend.
