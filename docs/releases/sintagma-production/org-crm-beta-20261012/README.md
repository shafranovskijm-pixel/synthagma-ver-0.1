# Organization CRM Beta release, S-048

The organization workspace persists clients, separate deals, dated tasks and communication notes in four new `org_crm_*` tables. It does not connect the administrative sales CRM, modify legal document statuses, infer payment, import old leads, send email or schedule notifications. A task reminder is its due date and the UI's due/overdue display.

Implementation source is `implementation.sql`; `supabase/tests/prepare-org-crm-beta.mjs` builds the migration and the single-request release transaction from the authorized production catalog. The tracked migration is `20261012200000_org_crm_beta.sql`. `expected-release.json` contains its digest, bundle SHA-256, helper guards and postcheck count. No production mutation was performed by the SQL-package author.

## API

- `org_crm_snapshot(p_organization_id uuid)` returns a JSON object with `clients`, `deals`, `tasks`, `activities`, `assignees`, exact `counts` and `truncated` flags. The first three arrays cap at 1,000, recent activities at 500. Each business row contains its `organization_id`. A partial snapshot must be labelled in the UI. Assignee emails are null.
- `org_crm_save_client`, `org_crm_save_deal`, `org_crm_save_task` each accept `p_organization_id uuid`, `p_id uuid|null`, `p_values jsonb`, `p_expected_updated_at timestamptz|null`, and return `{id, updated_at}`. Null ID creates. Updates merge whitelisted fields only, require the exact timestamp from the snapshot and lock the existing row. A missing or stale update version raises `crm_conflict`, SQLSTATE `40001`. Preserve timestamp microseconds; do not round through a JavaScript Date.
- `org_crm_add_activity(p_organization_id uuid, p_client_id uuid, p_deal_id uuid|null, p_activity_type text, p_description text)` returns `{id, created_at}`. The actor is set from the authenticated caller. History is append-only through this API.

Client fields: `org_name`, `inn`, `email`, `phone`, `address`, `notes`. Deal fields: `client_id`, `title`, `stage`, `amount`; stages are `new`, `contacted`, `negotiation`, `won`, `lost`. These stages are commercial tracking only. Task fields: `client_id`, nullable `deal_id`, `title`, `description`, `type`, `status`, `due_date`, nullable `assigned_user_id`. Task types are `call`, `email`, `meeting`, `followup`, `other`; statuses are `pending`, `done`, `cancelled`. Activity types are `call`, `email`, `meeting`, `note`; writing an email activity does not send a message.

Limits: name/title 300, INN 32, email 320 plus address-format check, phone 100, address 1,000, notes/description 10,000 characters; amount is nonnegative, below 100 trillion and stored with two decimal places. Due dates must be finite. Completion timestamps are server-managed.

## Access and preservation

Each entry point checks the canonical `can_access_organization` permission and account revocation. Reads require `sales.read`; writes require `sales.write`. CRM is enabled for `standard`, `professional`, `maximum`, matching the current frontend matrix. No corresponding custom-enabled category or central database feature helper exists in the audited source. The gate is applied to direct table reads too; unknown/free/start plans deny access.

Authenticated users receive table SELECT with RLS, and mutation rights only through the four explicit write RPCs. Direct table INSERT/UPDATE/DELETE are not granted. Anon/PUBLIC are closed. Private helpers cannot be executed by authenticated users. The service role retains table maintenance access. Composite foreign keys enforce organization/client/deal identity even for writes outside the RPCs.

An assignee must be a verified owner or an unexpired same-organization staff member with `can_receive_crm_tasks`, without account revocation. An old assignment may remain while finishing an existing task after the assignee expires; changing an assignment rechecks eligibility. New records do not create global sales-manager profiles or roles.

The only changed existing function is `account_deletion_snapshot(uuid)`: four names are added to its existing organization shared-work list, so owner deletion is stopped during preview before access revocation. Its remaining body and ACL are preserved. Organization foreign keys use RESTRICT as a second safeguard; actor references use SET NULL on Auth removal. The full legacy deletion workflow is not executed in the isolated fixture; the exact four-line diff and contribution to the existing blocker are checked.

## Local checks

Run with the installed Node runtime from the repository root:

```powershell
& 'D:/Codex/tools/node-v22.23.2/node-v22.23.2-win-x64/node.exe' supabase/tests/prepare-org-crm-beta.mjs D:/Codex/work/sintagma-queue/work/s048-crm-beta-20261012/catalog.json D:/Codex/work/sintagma-queue/work/s048-crm-beta-20261012/catalog-extra.json
& 'D:/Codex/tools/node-v22.23.2/node-v22.23.2-win-x64/node.exe' supabase/tests/test-org-crm-beta.mjs D:/Codex/work/sintagma-queue/work/s048-crm-beta-20261012/catalog.json D:/Codex/work/sintagma-queue/work/s048-crm-beta-20261012/catalog-extra.json
```

The runner uses isolated in-memory PGlite with actual prerequisite function definitions and synthetic accounts. It checks 92 assertions and all 38 SQL postchecks, ledger failure rollback, replay rejection, tenant isolation, permissions, expiration/revocation, plan gates, actor attribution, relationships, stale versions and honest snapshot caps. All synthetic business writes roll back. See `validation.json` for the actual run result.

## Production gates

1. Save `backup-before.sql` output and run `preflight.sql` against the approved project. The canonical helper definitions, grants, required columns and existing deletion snapshot must match the captured catalog; all four new tables and function namespace must be absent.
2. Review the exact migration, Git revision and `expected-release.json`. Run the entire `release-transaction.sql` as **one SQL-editor request**, using the repository's existing advisory-lock and migration-ledger workflow. It locks the ledger, refuses replay, checks the embedded exact source, applies the schema, records that exact source, asserts every postcheck and preservation of unrelated objects, then commits. Never split BEGIN and COMMIT across editor requests.
3. Save `release_result`, rerun `postcheck.sql`, confirm the exact source ledger row and perform a read-only organization/staff snapshot. No real customer fixture is needed for schema deployment.
4. Publish the corresponding frontend and verify the real organization UI. Git, schema success, hosting success and a real user completing the client→deal→task→history path are separate gates. Do not claim user acceptance from the synthetic fixture.

If the transaction errors, roll it back and diagnose the mismatch. Do not weaken the guard. After commit, prefer a forward fix. Dropping the four tables after users have created records would destroy business data and is not an automatic rollback step.
