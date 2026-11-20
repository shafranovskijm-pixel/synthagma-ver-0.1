# Central RTN news ingestion candidate

This package adds a global public-source cache and constant-size factual
intents. The1300/1400 source files, old bank worker/job27, client courses/results,
prices, quotas and native infrastructure remain unchanged. Migration1500 makes
only two explicitly authorized exact-preimage changes to installed reader
bodies, described below. No new schedule is installed by these files.

## Authority and state

`request_rtn_news_check(org)` uses the genuine actor lock, `courses.write` and
existing entitlement before enqueue/cache access. Its lock order is subject,
organization advisory fence42/key-share, then global runtime row. Actor,
`courses.write` and entitlement are checked before acquiring shared locks and
again after each wait, before either enqueue or cached-result return. The
native runner includes real two-session runtime-wait permission/hold/revocation
cases plus an organization-fence wait. No user/org attribution is persisted in the global cache. `get_rtn_news_check_state(org)` requires
`courses.read` plus entitlement and exposes no lease token.

Only service-role RPCs enqueue scheduled work, claim, complete and project
facts. One active global run, row locks, a120-second lease, generation and a
three-claim ceiling protect retries. The global manual cooldown is10minutes;
successful RSS and transient failure are due in1hour, provider401/403/429 in
24hours. Manual refresh also respects provider blocking. These are shared
technical cooldowns, not organization tariff/student quotas.

One separate cron task body is `{"task":"rtn-news-reconciliation"}`. Its index
uses the unchanged provider-generated opaque authentication helper. The manual
index accepts only a genuine user session and `{"organizationId":"..."}`;
the service can claim only the run returned by the scoped user RPC. No caller
URL/run/admin/actor selector is accepted. Only the two new function entries in
`supabase/config.toml` set `verify_jwt=false`: the manual handler still checks
`auth.getUser`, while the cron checks the unchanged opaque-auth helper first.
Existing function entries and credentials are unchanged; deployment and real
gateway acceptance remain root's separate release gate.

## Evidence and event semantics

The approved parser consumes one bounded TLS response. A local observing stream
captures the same XML bytes with a1MiB ceiling; no clone or second GET is used.
Its SHA must equal the parser's response SHA. `rtn-sources/news/rss/<sha>.xml`
is private and uploaded with `upsert:false`; a duplicate is accepted only after
exact private-object size/hash readback through supported storage-js2.90.1
`download(path).asStream()`. The stream is capped before copying to a buffer,
cancelled at its first excess byte/error and has a20s body deadline. The
ordinary SDK fetch separately bounds headers/body at30s; no signed/public URL
fallback or second official GET exists. No object is deleted or overwritten.

Three hashes deliberately mean different things:

- Capture SHA identifies the XML bytes consumed by the parser, not compressed
  HTTP wire bytes.
- `news_item_evidence.raw_item_sha256` stores the approved adapter's canonical
  item-content digest (URL/headline/full normalized source text/publication
  timestamp), not a byte hash of an XML item subtree.
- A news event's `update_events.content_sha256` is a version fingerprint of that
  item digest and explicit predecessor. This permits A→B→A as three immutable
  versions; repeated current A is a no-op. Source/release event hashes retain
  their existing exact original-source SHA semantics.

Public cards contain headline and official link. Descriptions/photos are not
republished and no LLM summary or legal effective date is invented. First RSS
bootstrap and first-seen older posts are historical/non-notifiable; later
observed corrections have explicit predecessor/evidence. SQL inserts a batch in
ascending publication-date/URL order, so newest-first RSS input cannot make the
homepage select the oldest headline in that batch.

RSS success always remains `partial`/`finite_rss_window`; older coverage is
unknown. Complete archive ingestion is **not implemented**. The official saved
page has observed pager links, but this worker never fetches or guesses archive
pagination. Before adding archive catch-up, separately review its bounded
coverage and applicability. Feed pagination remains the frozen1300 sequence
contract; the narrowly patched homepage policy below avoids late historical
items displacing a current event, without hiding them from the shared feed.

## Factual version projection

Three narrow AFTER INSERT triggers only enqueue source-revision,
bank-normalization and release identities. They never fetch or copy keys or
results. A bounded service batch projects committed references with exact bank
and source/release metadata; late normalization/new directions are not lost in
a timestamp sweep. New facts precede historical bootstrap backlog. Both task
count and examined bank subjects are capped per call, with an explicit cursor
for a larger source. A failed intent rolls back its partial events and retains
bounded retry/error state. Existing facts are only historical metadata, never
invented learning/admission history or notifications. Projected source events
use the actual stored `source_revisions.captured_at` as observation; releases use
their actual `published_at`. Later projection never invents a fresh observation
for an old source fact.

## Two exact installed-reader patches

`get_rtn_update_summary(uuid)` keeps the same access guards, DTO and capped1001
count query. Its independent latest search prefers nonhistorical facts by
actual `observed_at`, then sequence; if only historical facts exist it uses real
publication/capture time before insertion sequence. One matching presentation
index is added. The latest selection is not limited to the1001 count page.

`get_my_rtn_notifications(uuid,bigint,integer)` changes only the same news
eligibility condition at its two existing bounded materialization/pending
queries. An explicit news correction (`previous_event_id` present) may pass the
original-publication cutoff, while retaining the real old publication date.
Notifiable/nonhistorical status, strict `observed_at > enabled_since`, current
topic/kind/bank access,50-row batches and exact-recipient uniqueness are
unchanged. Late opt-in after the correction and an ordinary old first capture
still create no delivery. No push, external message or shared read state is
introduced.

Both patches require the exact post1400 SELECT-captured body MD5s
`d68d91d06db9c2ace8a6175eeada4304` and `3de5144ef4934330e9838549c1329396`,
owner, ACL, config, volatility and security. Exact anchors occur once/twice;
`CREATE OR REPLACE` preserves their recorded OIDs. The final old-catalog guard
allows only those two computed bodies to differ, with every other metadata
field and every other old function exact, including all three privacy helpers.
No installed1300/1400 migration is replayed or modified.

## Qualification

Run the native runner only in a new empty loopback PostgreSQL17 database named
`rtn_news_lab_ci`, with the standard `PG*` variables and optionally `PSQL`:

```text
python scripts/test-rtn-news-sql.py
```

The optional isolated WASM adapter uses the same SQL:

```text
python scripts/test-rtn-news-sql.py --prepare-only
node supabase/tests/rtn-news-ingestion/run-pglite.mjs
```

The fixture composes prerequisite13 and exact released14 with earlier reviewed
source in an isolated database, not production. It never runs the old41/71-case
suites. `review-delta.sql` covers the two exact patches, real fact timestamps,
late historical projection, latest outside the bounded count page, correction
after opt-in, repeat/late opt-in and ordinary old first capture. Body/config
drift and a public original bucket must reject1500 atomically without repair.
New cache tables contain no personal links and no privacy body is pinned or
patched. Only the two declared reader bodies may differ from the full captured
old pg_proc rows. Actual post14 schema rollback qualification remains root's
separate release gate. Native concurrency, Deno endpoint types, private
Storage, genuine manual/scheduled runs, live UI and native port require separate
evidence; PGlite cannot substitute for real two-session tests.
