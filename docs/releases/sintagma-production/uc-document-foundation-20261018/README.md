# UC document foundation — release 1

Prepared only. Deploy through the reviewed workflow; no script here connects to production.

This is the first technical release within UC-001–006. **UC-003 remains partial:** separate `documents.sign`/`documents.issue` permissions and authoritative teacher/group assignments are the next release. Current canonical document read/write and tenant boundaries must not be described as completing that broader acceptance criterion.

The explicit package contains only:

1. `20261018100000_uc_document_access_boundaries.sql`
2. `20261018101000_uc_signature_integrity.sql`
3. `20261018102000_uc_document_versions.sql`
4. `20261018103000_uc_document_cleanup_scheduler.sql`

Regenerate with `node docs/releases/sintagma-production/uc-document-foundation-20261018/prepare-release.mjs`. Review `release-manifest.json` and the complete `release-transaction.sql`. The manifest hashes each source, its executable body, the combined transaction, all local Edge imports and `supabase/config.toml`. Regenerate after any listed file changes.

## Ordering

Deploy the hardened Edge handlers first, including the service-only cleanup handler, faithful PDF renderer, authenticated self-examination handler, signature finalizer/certificate, signing-email/creation and scoped public verifier. The new finalizer fails closed when its RPC is absent. The new certificate handler returns existing bytes or fails before writing if the new schema is absent. The self-examination handler checks version schema before AI or upload.

Execute the **entire** `release-transaction.sql` as one request. It uses REPEATABLE READ, the existing production release advisory lock and migration-ledger lock. Application and Storage tables are held while old-column row hashes are compared; cron is changed only through `cron.alter_job`. Unknown policy/function drift, an unexpected ledger entry, late failure, row change or unrelated cron change aborts the whole transaction. The exact complete original migration sources are recorded in `schema_migrations.statements[1]`; only reviewed outer transaction delimiters are removed for execution inside the wrapper.

Then deploy the companion frontend. Run ordinary authorized UI acceptance. `preflight.sql` and `postcheck.sql` are read-only metadata queries and contain no impersonation claims or document mutation. Postcheck must return true for every field. The internal preservation witnesses are transaction-local and do not expose personal rows.

## Cleanup pause

Fresh metadata confirmed the active `purge-recycle-bin-storage-daily` job uses an inline anonymous bearer. No bearer value was read into files or printed. Migration 103000 checks the sole job, active state, release-role/database ownership, exact command MD5 and route/header shape, then sets only `active=false` through the supported API. Job, command, schedule and other jobs remain unchanged. This intentionally pauses automatic deletion. Secure retention scheduling will be reviewed separately under UC-024; never reopen the handler to anonymous access for compatibility.

## Local verification

```text
node node_modules/vitest/vitest.mjs run supabase/functions/_shared/uc-document-access.sql.test.ts supabase/functions/_shared/uc-release-batch.test.ts --maxWorkers=1
node supabase/tests/test-uc-signature-integrity.mjs
```

The access suite runs 42 actual SQL cases. The combined-release suite runs five tests: complete installation/source ledger/history preservation; complete rollback including cleanup pause after the last ledger insert fails; unknown-policy rejection; embedded source-tamper rejection; and rejection of the unmodified production command hash in a synthetic environment.

The production cron command contains a credential and is deliberately absent from fixtures. For the successful synthetic batch test, **only** its opaque command-MD5 constant is replaced by the hash of a harmless synthetic command, with the corresponding embedded source/executable/ledger hash checks recomputed in memory. The executable migration logic, APIs and transaction remain verbatim. Production generated artifacts are never altered for this fixture adaptation. A separate test proves the unmodified production guard rejects the synthetic command. This is not a test using the production secret.

PGlite is single-session and the cron API is a local fixture. Real hosted two-session races and pg_cron C implementation are not simulated. Row-lock, optimistic-revision, counter-upsert and rollback behavior are covered by the component suites; no claim of production mutation testing is made.

Historical document rows and files are not repaired, backfilled, renumbered or moved. Three unresolvable legacy company objects remain admin-only pending ownership evidence. Existing signed URLs retain their original TTL. Private-bucket UI must resolve signed read URLs; stored historical public-shaped URLs are locators, not a decision to make those files public.
