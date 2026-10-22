# Purge worker execution boundary (2026-10-22)

This release contains migration 621, already installed in production on 2026-10-22. Do not replay the migration outside the guarded migration-ledger procedure. Do not invoke the purge function or restart a cleanup scheduler to validate this release.

## Scope

The migration revokes EXECUTE on public.purge_recycle_bin_30d() from PUBLIC, anon and authenticated. It preserves the exact pre-existing explicit grants to postgres, service_role and sandbox_exec_atxwvjxbqjgkbjlhsdch. It changes no function body, owner, SECURITY DEFINER setting, search_path, trigger, policy, role membership, data row, file or cron job.

The prior function was exposed to client roles and deletes global records solely from a 30-day trash age. Existing DELETE triggers can reject a call depending on eligible rows; no successful anonymous purge or deletion is claimed. The routine was never called during preparation or production verification.

This is a bounded access containment, not completion of UC024. Thirty days in trash is a recovery window, not an approved legal retention rule. The separate browser permanent-delete path and the storage cleanup edge worker still require the UC024 retention, legal-hold and approved-destruction workflow. The storage cleanup scheduler must remain paused. No physical subject-data erasure, full archive restoration or backup guarantees are asserted by this release.

## Recorded verification

The release owner reported a successful production ROLLBACK rehearsal, exact fresh rollback readback at ledger 620, then a successful guarded COMMIT and fresh readback at ledger 621. All 379 pre-existing table rowsets and covered metadata were preserved except the exact target function proacl; the migration ledger gained only the exact source migration. Function OID 136513 and body MD5 5ead79d7015e619732c741b20bea4794 remained unchanged. Effective EXECUTE became false for anon and authenticated and remained true for service_role. The raw ACL retained exactly postgres, service_role and sandbox grants.

Source-only preparation does not independently attest those executions. Actual results are saved in the task evidence directory work/uc024-retention-preparation-20261022/atomic621/v1/ACTUAL_REHEARSAL_AND_FRESH_ROLLBACK.json and ACTUAL_COMMIT_AND_FRESH_READBACK.json. The root agent checked the complete old pg_proc tuple except proacl against fresh readback. These actual provider results are distinct from the generated source-only rehearsal.sql and commit.sql; do not relabel generated SQL as an executed PASS.

## Files and review

- The migration is the single REVOKE plus explanatory comments, exactly as hashed before release.
- prepare-guarded-release.mjs is the self-contained wrapper producer. It does not connect to a database. Its source-generated rehearsal and commit wrappers differ only at the final transaction terminal.
- ACTUAL620_PURGE_FUNCTION_PREIMAGE.json records the exact prior catalog tuple, ACL and role metadata used for strict comparison; it contains no customer rows, bearer keys or raw scheduler command.

The producer pins the original ledger and function preimage, the exact old and expected ACLs, full old rowsets, covered metadata and object inventories, then appends the exact migration source to the ledger. Existing source holds and old evidence remain unchanged. The publication manifest records SHA-256 hashes of exact file bytes.
