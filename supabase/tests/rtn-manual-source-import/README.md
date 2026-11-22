# Manual official-source intake qualification

This is a fresh synthetic lab. It loads released prerequisite DDL and synthetic
seed only, without running earlier acceptance suites. No real source HTTP,
production Auth user, file upload or customer data is touched.

```text
python scripts/test-rtn-manual-source-import-sql.py --prepare-only
node supabase/tests/rtn-manual-source-import/run-pglite.mjs
```

The 26 new functional cases cover private-storage receipt guards, exact replay,
source generation, historical rollback refusal, queued/running/expired work,
normalization preservation, authority, privacy and the exact released-source
origin. The storage row is an explicit adapter: real byte/hash readback is tested
by the separate runtime tests and must be accepted on the actual pilot too.

For native qualification use a **fresh loopback PostgreSQL17** database named
`rtn_manual_source_import_lab_ci`, then:

```text
python scripts/test-rtn-manual-source-import-sql.py
```

The native runner adds four actual blocker/waiter PID witnesses: a queued check
commits during the wait; a genuine old completion wins the generation CAS;
actor revocation becomes visible after waiting; and two concurrent requests reuse
one immutable accepted intake. No clock sleep alone is presented as concurrency
proof. Function body/authority postimages and policy-table triggers/RLS are saved.

This proves neither official-file acquisition nor approved educational answers.
It does not clear an HTTP403, alter retry policy or complete the Techservice pilot.
