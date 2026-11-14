# Normative-review admission

Run `python scripts/test-rtn-freshness-sql.py` only against a disposable native
PostgreSQL 17 cluster, loopback host, database `rtn_freshness_lab_ci`. The runner
refuses another database/host/version. Use the fixture bootstrap superuser to
create isolated synthetic roles; migrations run as the existing non-superuser
`postgres` owner. No production credentials, account erasure or Auth writes.

The lane applies the actual base, quota, drafts and privacy migrations with
captured released guards/erasure bodies. Unrelated legacy erasure domains use
the declared empty shape adapters from the privacy lane, not fake product
authority. It then applies migration 240, checks exact preimage rollback and
immutable old attempts/keys/releases, recursive deadline aliases, calendar/date
validation, Moscow exclusive boundaries, missing-deadline fail-closed, no older
fresh fallback, preserved active attempts/results, private helpers and unchanged
financial/client sentinels. Two actual concurrent PostgreSQL connections verify
new assignment/attempt admission rechecks the latest edition after the shared
organization lock, with full rollback of quota and learning rows on refusal.

Historical expiry cannot be newly published through the real publishing RPC;
that rejection is tested. The isolated test alone inserts historical release
receipts to simulate a previously valid release whose deadline has elapsed.
This fixture operation is neither a product API nor a deployment instruction.
Unchanged PDF checks never extend editorial or declared validity deadlines.

Publication/admission requires an explicit top-level `module.review_before`,
no later than the actual editorial review's Moscow date plus seven days. A
law's `valid_until` in 2032, or a nested evidence review date, is not a weekly
editorial review. Such records may be staged for review but cannot admit new
training. All deadlines are exclusive at Moscow midnight; legal validity and
editorial review limits are retained separately in immutable metadata.
