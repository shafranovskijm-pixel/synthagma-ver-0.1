# Shared RTN update metadata qualification

`20261120130000_rtn_global_updates.sql` adds only global official-source metadata
and authenticated organization-scoped readers. It does not fetch a source,
grant ingestion authority, backfill history, create personal subscriptions or
deliver notifications. Existing privacy bodies remain unchanged and still flag
unexpected user UUID text inside global content.

The fixture reuses released organization/billing/erasure guard definitions and
the existing RTN setup builder. Synthetic source/release rows test references;
they do not represent approved real questions or a genuine learning cycle.

For native PostgreSQL17 use a new, empty, dedicated database
`rtn_updates_lab_ci` on loopback, with `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGPASSWORD` and optionally `PSQL` set. Run:

```text
python scripts/test-rtn-updates-sql.py
```

The native runner refuses other database names/hosts and verifies PG17 before
setup. It must never target production or an existing shared database.

The optional isolated single-connection WASM adapter uses the same SQL:

```text
python scripts/test-rtn-updates-sql.py --prepare-only
node supabase/tests/rtn-global-updates/run-pglite.mjs
```

Results are written under `outputs/rtn-updates-sql`. PGlite results are labelled
separately and prove neither native multi-session races nor hosted release.
The candidate also needs root's actual-schema rollback qualification and one
reviewed install; never replay earlier installed RTN migrations on production.
