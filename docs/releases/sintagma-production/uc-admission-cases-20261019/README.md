# UC012 personal admission case — release115

This directory prepares one atomic SQL115 release on the exact approved 100–114 baseline. It does not deploy SQL, Edge functions or the frontend. Human review of an internal personal case remains separate from technical course access, contracts, identity, legal compliance and official issuance.

`prepare.mjs` uses the actual synthetic PGlite fixture and captured 15 authority/erasure definitions. Generation is blocked until the five exact reviewed old-body transformations in `reviewed-source-anchors.json` are frozen with the final migration. Run from the repository root with the pinned Node20 runtime:

```powershell
node docs/releases/sintagma-production/uc-admission-cases-20261019/prepare.mjs
```

The generated manifest pins the canonical LF migration and embedded batch, 15 prior ledger entries, 71 prior relations, 15 captured dependencies, all new function bodies/grants/owners, six private table schemas and ACLs, six Storage policies, exact new triggers and the private 20 MiB PDF/JPEG/PNG bucket. It also pins 13 runtime/source files: five native Edge TypeScript files, seven frontend sources and root-owned Supabase configuration. No generated type or unrelated dependency is packaged. New object ownership is pinned to the approved installer role by its portable role name; unexpected default grants fail closed. Existing release sources and manifests are unchanged; only the nested previous postcheck's five reviewed account-function definition pins are substituted for compatibility.

Root's release sequence:

1. Run `preflight.sql` read-only and require every returned flag to be true. It accepts only the exact installed 100–114 ledger, captured definitions and prior postcheck, with115 absent.
2. Submit the **entire** `production-batch.sql` in one request. Do not extract or execute its embedded migration independently. The transaction uses a release advisory lock, a ledger lock and locks on the 71 preserved relations. It records the exact canonical LF source once and checks all metadata/preservation predicates before committing.
3. Require every final postcheck flag to be true. The batch preserves prior rows, relation metadata, owners/ACLs, old function bodies except the five exact reviewed patches, old policies/triggers, counters, signatures and cron metadata. It allows only the six new empty private tables and reviewed functions/policies/triggers/bucket; no historical backfill occurs.
4. Deploy only `admission-case-evidence-commit` and `admission-case-evidence-file` with the pinned five-file native runtime, then the compatible frontend and configuration. The two `verify_jwt=false` configuration entries rely on the handlers' explicit original-bearer `auth.getUser` and exact current SQL authority. Sealed bytes are transported by a dedicated service client only after the original caller's exact authorized context; service attestation does not decide business facts.
5. Perform the root-owned isolated synthetic acceptance. Do not create real admission decisions, legal activation, issuance, signatures, account deletions, notifications or historical data backfill as release tests.

`postcheck.sql` is repeatable and metadata-only; it does not read personal rows. Atomic preservation predicates do inspect prior rows inside the deployment transaction to compare before/after hashes; those hashes are temporary and are not exported. A failure before commit rolls back new SQL state, the private bucket, the ledger entry and all five old-body transformations. A repeated batch is rejected by preflight; it is not an idempotent reapplication tool.

Local tests execute real SQL in synthetic PGlite/PostgreSQL 18. They include positive whole-batch acceptance with nonempty prior 114 registry/projection rows and signatures, missing/deviating prerequisites, exact embedded-source tampering, final-ledger failure, and late metadata/data/ACL/policy/trigger/function/cron/backfill faults. Portable fingerprints preserve NOT NULL via `attnotnull` and omit only PostgreSQL 18 redundant `contype='n'` rows. These tests do not prove production Auth, actual Storage bytes, PostgreSQL 17 execution, multi-session races or a production rollback. Docker's daemon is unavailable; no two-session concurrency acceptance is claimed.
