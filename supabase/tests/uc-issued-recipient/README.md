# B1 issued-recipient native case

Run from the repository root with Node 24 and dependencies from `npm ci`:

```sh
node supabase/tests/uc-issued-recipient/prepare-native.test.cjs
docker pull postgres@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df
node supabase/tests/uc-issued-recipient/run-native.cjs
```

The runner requires this exact Linux PostgreSQL 17.11 image to be present; it does not pull images itself. It creates one disposable container/database, exposes an ephemeral host port only on 127.0.0.1, and verifies database, role and container cleanup. Credentials are not saved in reports.

`B1_NATIVE_ARTIFACTS` selects a dedicated output directory; default: `outputs/uc-issued-recipient-native`. Reports include exact input/source pins, actual backend PIDs, one-case result, schema metadata and cleanup.

The manifest uses 131 existing tracked inputs and 34 finite bundled inputs. Every held target byte count and hash is checked. For 58 historical CRLF inputs, an explicitly pinned Git-LF blob can reconstruct those same held bytes; the canonical source digest and reconstructed target digest must both match. Other differences are refused. The preparation self-test uses actual Git blobs to exercise the Linux checkout, rejects an incorrect derivation and verifies a failure report before Docker starts. Actual SUT workers/migrations are separately pinned. No local `work/` path is used. Only the held PGlite constructor is replaced with the real PostgreSQL adapter; SQL, actors and guards are unchanged. No old functional suite is imported.

The one new case covers durable preparation; real two-backend 42007 conflict/retry; alias deduplication; normal owner CAS sign-only delegation to an existing synthetic reviewer; second-staff resume without verifier replay; actual canonical PDF bytes; account PEP, staff receipt and own inbox; modern HTML and unbound legacy compatibility; bounded rollback corruption and source-history checks.

The Storage boundary contains only owned synthetic bytes. This does not prove remote Auth/StorageHTTP, human identity or legal policy approval. XML/FRDO packet methods are not called by this B1 path. The held bootstrap imports an npm 0.9.12 specifier aliased to the actual locked xmldom 0.8.11 module; no XML/0.9.12 acceptance is claimed. `B1_TEST_RUNTIME` optionally selects another explicit module-resolution package. Root application dependencies are unchanged.
