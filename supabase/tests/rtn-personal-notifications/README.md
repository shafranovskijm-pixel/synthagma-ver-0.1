# Personal RTN notification candidate

This is a candidate, not an installed or delivered system. It preserves the existing shared bell database behavior.

- Candidate: `supabase/migrations/20261120140000_rtn_personal_notifications.sql`.
- Actual managed guard preimages: `work/rtn-workspace-20261120/MANAGED_CURRENT_AUTHORITY_PREIMAGES.json`.
- API contract: `work/rtn-workspace-20261120/PERSONAL_RPC_CONTRACT.json`.
- Two private RLS tables, four own authenticated RPCs; three exact privacy body patches preserve existing function identity and authority.
- Default off, strict current server topic options, CAS generation/no-op stability, after-lock cutoff, no historical replay, unique event recipient, own read state and confirmed erasure integration.
- The same canonical event projection is embedded in a bounded personal inbox response. No question/media payloads, recipient impersonation, service fanout or org shared `is_read` write.
- Materialization does not use a max-sequence high-water cursor, so a lower sequence can be discovered after its later commit.
- Stored malformed preferences close delivery and report reconfiguration rather than enabling a partially valid selection.

## Local single-connection qualification

Use existing dependencies; do not install packages or change a shared cluster.

```powershell
python scripts/test-rtn-personal-sql.py --prepare-only
& 'C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/student-progress-reset-20261029/runtime/node-v22.21.1-win-x64/node.exe' supabase/tests/rtn-personal-notifications/run-pglite.mjs
```

The explicit x64 path is verified on this computer; check its existence on another computer. Default PATH Node may be ia32 and fail WASM memory allocation.

The initial candidate's local result is `outputs/rtn-personal-sql/pglite-result.json`: 70 distinct cases on source `9ba7445b...f59f7`. This reuses the released real privacy fixture builder but does not execute previous passing suites. It covers actual stored functions/ACL/erasure in synthetic fixtures; unrelated legacy domains remain explicitly empty shape adapters. The later helper delta below is a separate qualification, not a claimed full rerun of that initial receipt.

The later preauthorization helper delta is qualified separately, without repeating those 70 cases:

```powershell
python scripts/test-rtn-personal-sql.py --prepare-only
& 'C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/student-progress-reset-20261029/runtime/node-v22.21.1-win-x64/node.exe' supabase/tests/rtn-personal-notifications/run-pglite.mjs --preauthorization-delta
```

`outputs/rtn-personal-sql/preauthorization-delta-result.json` contains only the new foreign-caller 42501 case. The new helper checks staff/entitlement before taking an organization lock and repeats both checks after waits. Native qualification additionally holds a victim organization's advisory lock open while the foreign caller must return 42501; lock timeout is a failure, not authorization success. This real two-session boundary case remains unrun until native CI.

Synthetic event times are explicitly after the server opt-in cutoff to avoid WASM millisecond-resolution clock ties. This is fixture setup, not an assertion about actual official events.

## Native PostgreSQL17 qualification still required

Use a fresh disposable PostgreSQL17 instance/database called `rtn_personal_lab_ci` on loopback only, with `PSQL` set if needed. The runner refuses the wrong host/database/version or any pre-existing RTN schema. It does not DROP databases, stop a server, terminate backends, or reset a shared environment.

```powershell
$env:PGHOST = '127.0.0.1'
$env:PGDATABASE = 'rtn_personal_lab_ci'
python scripts/test-rtn-personal-sql.py
```

Each SQL file uses a new psql connection and explicitly sets the fixture postgres owner after setup. This does not change production owner checks.

Native-only two-connection cases cover unsubscribe ordering, committed revocation, stale CAS, duplicate simultaneous own pulls, late lower-sequence commits, and a pending pull after real synthetic confirmed erasure. These cases are authored but were not run locally. Do not call 70 PGlite cases native concurrency proof, or add repeated/overlapping runs to the count.

## Installation boundaries

Before any installation: independent exact-source review, current guarded dependency/erasure/public bridge readback, exact-head native CI, whole-transaction rollback against current actual schema, and one supported atomic install are still required. No production erasure is a test. Global schema is a separate prerequisite; its source default observed_at=now() means a future ingester must explicitly store real observation clock_timestamp(), not use transaction-start as discovery time.

New subscription and delivery state is private. Confirmed account erasure removes only the target user links; another recipient's residual organization context blocks empty-organization deletion instead of cascading away. Unknown personal UUID content remains a review blocker.

No new public promise about instant push, source scheduler/news ingestion or a complete Tech training pilot follows from these local tests.
