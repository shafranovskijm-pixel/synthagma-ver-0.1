# RTN normative attestations: isolated native regression suite

The migration under test is the single canonical file
`supabase/migrations/20261114125000_rtn_normative_attestations.sql`, SHA256
`6b926bc42e27b6c0123c1104ea92684d30705bacb12487f9af04340f6eacd455`.
The runner checks these exact bytes; it never generates or rewrites product SQL.

`SOURCE_PROVENANCE.json` pins every copied synthetic fixture and its relevant
foundation source. The base fixture reproduces the canonical post-provider-
reconciliation function bodies, not an invented service/admin auth bypass.
It contains only synthetic profiles, organizations, questions and documents.
Captured production *function source code* is exercised in the disposable
cluster; no production records, secrets or deletion requests are present.

Run source checks without any database connection:

```sh
python supabase/tests/rtn-npa250/run_native.py --verify-only
```

The full suite requires an independently started PostgreSQL17 cluster with:

- bootstrap role `lab_bootstrap`, trust authentication, no hosted credentials;
- host connection `127.0.0.1:54852`, database `postgres` available;
- `PGDATA` equal to this directory's **absolute** `native-pgdata` path.

The new workflow starts `postgres:17.11-bookworm` on loopback and mounts the
workspace at the identical absolute path in the container. The Python protocol
client uses the real engine and refuses password challenges or foreign database
names. Before resetting only `rtn_npa250_lab_ci`, the runner checks server path,
port, version and bootstrap identity. Ordinary postgres is then created as the
non-superuser source owner, preserving the provider permission model.

```sh
python supabase/tests/rtn-npa250/run_native.py
```

Success requires all312 assertions, including real backend lock waits in both
source/admission and manifest/finding race orders, plus prepared-release A versus
concurrent publisher B configuration CAS. It also covers complete/partial NPA
proofs, unsupported dependencies, transient failure windows, JSON null/missing
fields, immutable source generations, crash recovery and the exact captured
account-erasure workflow. Old synthetic attempt/grade/content/invoice snapshots
remain intact. Some negative fixtures roll back after their assertions; the
receipt counts executed assertions, not retained rows in the synthetic log.

Artifacts and PostgreSQL data stay in ignored local directories. Always stop
only the dedicated test cluster afterwards. The stored prototype Windows308
result is historical evidence, **not** a Linux CI result. Linux/production
acceptance must be reported separately.

Porting changes are limited to test adapters: migration is read from its actual
repository location, Windows executable paths and source-rebuilding scripts are
absent, outputs are isolated, the composite base is not double-wrapped, and
source/engine/assertion gates are explicit. Product SQL and fixture SQL bytes are
unchanged. This workflow neither deploys SQL nor changes any hosted role, hold,
price, customer course, learner result or schedule.

The reviewed follow-up adds only exact latest-check run identity/completion
metadata to existing projections, with four targeted native assertions. Old
dd803/308 prototype source and receipts were retained before this change.
