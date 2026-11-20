# Archive discovery: isolated qualification

This is a source candidate, not a production installation, source fetch or
completed RTN feature. Archive activation defaults **OFF**. The frozen contract
is `ARCHIVE_DB_CONTRACT_PROPOSAL_V3.json`; root owns review, CI and release.

The new migration creates seven restricted global tables and nine public RPCs,
an owner-only activation function and narrow private helpers. Four installed
function bodies change with exact preimages; all old metadata and other bodies
are checked unchanged. Installed1300–1600 source files are never replayed against
an existing database or edited by this package.

`scripts/test-rtn-archive-sql.py --prepare-only` writes a **fresh synthetic** lab
under `outputs/rtn-archive-sql`. It reuses only prerequisite builders, not released
acceptance suites. The candidate and acceptance files are mandatory. Synthetic
roles/claims and service payloads are fixture inputs, not real account identity,
actual downloaded files or observed production success.

For the labelled local WASM check use Node22 x64 with
`supabase/tests/rtn-archive-discovery/run-pglite.mjs`. The current receipt covers
60 distinct new single-connection cases after the cross-SCAN review fix. The
original58-case/e29 receipt is preserved separately, never summed with repeats.
The final coherent receipt is `pglite-final-result.json`. These cases are not
native concurrency proof.
The preimage mode loads prerequisites only and prints synthetic old function
metadata; it never fetches a source.

The native runner refuses unless `PGDATABASE=rtn_archive_lab_ci`, `PGHOST` is
loopback, PostgreSQL17 and a fresh RTN schema are independently confirmed. It
requires the meaningful single-connection coverage and five real two-session
lock witnesses, observed through the existing bootstrap statistics authority:

1. Activation waits, then detects a committed live legacy lease.
2. A stale anchor error waits behind success and cannot poison its cursor.
3. Completion starts before its deadline, actually waits on the shared lock,
   then rejects after the absolute deadline; reserved spend stays durable.
4. Archive-origin insertion wins a shared-lock race with RSS first appearance;
   the initial RSS event remains historical and non-notifiable.
5. Archive403 wins a shared-lock race; late older-epoch RSS success cannot clear
   its24-hour publisher block.

No native test server is started/reset/killed by this runner. Only its own psql
children are closed on failure. Native control-time seeds and cleanup affect
only this disposable fixture; they do not assert real public/private evidence.

The tests cover old legacy completion while OFF, unchanged RSS evidence from an
older capture, chronological replay/errors, empty feeds, inclusive1/7/8DATE
boundaries, owner activation/v2 CAS, per-GET full allowance, crashes/caps,
moving-page witnesses, immutable evidence, cross-channel historical provenance,
manual10-minute versus scheduled1-hour cooldown, bounded authorized readers,
stable candidate keysets and no HTML-created shared events/deliveries.

`request_deadline_at` fences public GET/body/parser at20seconds. Trusted runtime
must abort/discard late responses. Private persistence can settle afterward but
only inside the same absolute70-second invocation/live120-second lease/current
epoch. Every mutable deadline/block decision samples the server clock **after**
the shared lock. Unknown commits never cause a second error completion.

Campaign spend means conservative **reserved application-body allowance**, not
measured compressed-wire billing. Each attempted GET charges one attempt and a
full1MiB before network; no failure refunds. The200-candidate cap counts distinct
canonical URLs within the campaign, including globally known RSS URLs. Head or
boundary revalidation of the same URL adds an immutable observation, not another
unique candidate. Calendar budget is inclusive DATE arithmetic in a separately
named technical calendar, never a fabricated publication instant.

Production remains gated on independent source review, exact-head CI, fresh
actual-schema full-rollback qualification, genuine hosted RSS/private original
readback and reviewed v2 deployment/owner activation. Current publisher403 may
not be bypassed. These sources do not authorize actual DB/network/Storage/cron,
customer-data, billing, permission, price or quota operations.
