Fresh, disposable fixture only. Never run against a production database.

Prepare: `python scripts/test-rtn-manual-source-backoff-sql.py --prepare-only`.
Local WASM: `node supabase/tests/rtn-manual-source-backoff/run-pglite.mjs`.
Native: set `PGDATABASE=rtn_manual_source_backoff_lab_ci` on a **fresh loopback
PostgreSQL17** instance and run `python scripts/test-rtn-manual-source-backoff-sql.py`.
The runner refuses another database, host, version or existing RTN schema.

Only new manual-backoff cases execute. Existing prerequisite DDL and synthetic
seed are loaded without rerunning their old acceptance suites. Tests preserve
source/queue/original sentinels, check two old function bodies/authority, exact
24h/1h denial boundaries, genuine actor/tenant guards, receipt/DTO consistency,
completion ordering and stale transaction time. Native mode separately records
two actual source-row lock waits with exact blocker PIDs. No publisher request,
production event, account, source original or Techservice attempt is fabricated.
