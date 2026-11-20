# Bank-source automatic retry candidate1600

The installed `enqueue_due_rtn_checks()` can enqueue a new weekly check every
hour after a failed check because `last_full_check_at` remains NULL/older7days.
Actual root readback captured `OFFICIAL_HTTP_403` with `http_status=NULL`; the
source row has no error-code field. Migration1600 changes only this exact
function body, not the worker, manual request, claim, completion or job27.

## Retry policy

After the unchanged expired-third-lease cleanup and open-run guard, inspect the
latest terminal run for that source by `completed_at DESC,id DESC`:

- Recorded numeric401/403/429 or exact `OFFICIAL_HTTP_401/403/429` waits24elapsed
  hours. The unchanged worker stores these codes in `error`, even when its
  numeric HTTP field is NULL.
- Other/unknown terminal errors wait1elapsed hour. Once due they are eligible
  for retry even if a recent successful full check would otherwise keep the
  daily condition false. Without this explicit `retry_due` condition a claimed
  1hour retry would actually remain delayed by the old daily24hour condition.
- A newer terminal success supersedes an older failure. Completion order wins
  over queue/start order; an equal timestamp uses deterministic run ID order.
- A single server `clock_timestamp()` captured at invocation determines retry
  eligibility, avoiding a stale transaction-start `now()`. Equality at the
  deadline is eligible; the24hour interval is elapsed hours, not a calendar day.

Successful daily/weekly due clauses and the old daily/weekly kind selection
remain exact. An existing queued/running run still prevents another queue
entry; lower crashed leases remain reclaimable. Old third-exhausted-lease
cleanup remains, followed by a1hour transient-error delay. No queued run is
cancelled or rewritten by the migration. A previously queued source may still
execute once through the unchanged claim worker; this patch only prevents new
automatic requeues. Genuine manual permissions and the old manual cooldown
remain unchanged; no tariff/quota or ability to manufacture a user is added.

Existing privacy erasure deliberately clears a manual run's error text. If its
numeric HTTP field is also NULL, the erased class cannot be reconstructed:
it remains an unknown1hour error, not an invented403. Scheduled runs are not
actor-attributed and retain their machine error codes. Guaranteeing a durable
24hour class after such redaction needs a separate reviewed global-machine
status/provenance design;1600 does not change privacy bodies or recover history.

The latest lookup returns1row and is narrowed by the existing source_id index
prefix. No new index is included for the current tiny queue. If per-source
history becomes large, separately qualify a partial
`(source_id,completed_at DESC,id DESC)` index; LIMIT1 does not itself prove a
constant-time scan. There is no query of or modification to source originals.

## Exact authority and compatibility

The candidate requires root's actual body MD5
`9cdc279471df0cfce5023b20d00faf97`, existing postgres owner, service-only ACL,
search path, SECURITY DEFINER and volatile status. Two exact anchors and
`CREATE OR REPLACE` preserve the captured OID and all its other metadata. A
full old pg_proc snapshot allows only that one computed body delta and no new
functions/grants. Existing13/14/15 files, private privacy/permission helpers,
source facts, learning results, customers, schedules and financial data are
untouched. This file is not an installation or ledger wrapper.

## Isolated qualification

Fresh loopback PostgreSQL17 database `rtn_source_backoff_lab_ci` only:

```text
python scripts/test-rtn-source-backoff-sql.py
```

Optional isolated WASM adapter of the same SQL:

```text
python scripts/test-rtn-source-backoff-sql.py --prepare-only
node supabase/tests/rtn-source-failure-backoff/run-pglite.mjs
```

The runner reuses only released prerequisite setup and privacy/normative
migrations, never their already-passing acceptance suites. It refuses any
nonloopback/wrong/nonfresh database and uses explicit owner role/quiet psql per
connection. Negative metadata/body drift and a second application must refuse
atomically. New cases cover known/unknown failures, boundaries, stale
transaction clock, completion ordering, successful cadence, open-run bytes,
manual/service authority, unchanged source/original and client-data sentinels.
All credentials, users and facts are synthetic. Native CI and actual-schema
qualification remain separate root-owned gates; PGlite is not production or
real cron/source/TLS acceptance. No endpoint/UA/proxy/authorization workaround
is introduced for the actual403.
