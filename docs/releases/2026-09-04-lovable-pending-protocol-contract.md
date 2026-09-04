# Lovable generated-schema build repair — 2026-09-04

## Observed baseline

- GitHub feature `codex/goreltech-release-gate-20260904` at
  `5f7d42aa370375cbf9047df4c973d2f282347280` was fetched and checked out separately on D:.
- Compared with reviewed `7c211a0399194442581c734f8204ad5868bd6f4a`, only generated
  `src/integrations/supabase/types.ts` changed. Lovable removed objects absent from Live.
- Baseline app TypeScript exited 2: missing protocol table/RPC types and consequent
  invalid inferred result types in `studentLaborSafetyProtocol.ts`.

## Change

- An exact, local contract describes the expected protocol table/RPC, reusing the
  current Supabase client/session. It does not alter generated types or claim the
  pending migration is installed. Responses remain unknown until runtime validation.
- Malformed single/list/RPC responses are rejected. Successful writes still require
  matching version, entered values, and a separate persisted-row read-back.
- Read-back also verifies the student/course source identity.
- XML metadata loading checks the exact requested course/category IDs, not only counts.
- Existing missing-migration warnings, tenant scoping, compare-and-set, and explicit
  passed/failed results remain. No synthetic issuance, assessment, or Mintrud acceptance.
- No UI, common auth client, generated schema, migrations, student learning, or payment changes.

## Verification at source-review time

- Node 20.20.2 with locked dependencies from `sintagma-release-locked-20260904`.
- Ten focused test files: **147 tests passed**, exit 0. Covers protocol API/dialog/XML,
  student creation with group selection, group addition, enrollment deployment contract,
  and organization sidebar. Report: `D:/CodexTmp/sintagma-pending-contracts-targeted-20260904.json`.
- App TypeScript: **exit 0**, against unchanged real Lovable-generated schema.
- `git diff --check`: passed. Production build and feature-sync checks are separate gates.

## Deployment boundary

This repair alone does not install either pending migration, deploy Edge v18, publish
the frontend, or prove the GORELTECH production cycle. Live catalogue read-only checks
confirmed no target-object conflicts and valid parent columns/keys/helpers; both migration
versions remain absent. `gen_random_uuid()` resolves through `pg_catalog` on Live.
Backup/PITR remains unverified; an export action was stopped by safety review pending
explicit user approval. Production browser is at login, so authenticated E2E remains open.
