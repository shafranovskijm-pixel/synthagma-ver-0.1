# Isolated RTN account-erasure integration

Run only against a new disposable **PostgreSQL 17** database:

```sh
PGDATABASE=rtn_erasure_lab_ci PGHOST=127.0.0.1 PGUSER=postgres \
  PSQL=/path/to/psql python supabase/tests/rtn-account-erasure/run.py
```

The runner refuses other database names, non-loopback hosts and other PG major
versions. It never contacts Supabase or uses real accounts, receipts or JWTs.
Results are written to `outputs/rtn-erasure-native/`.

`live-erasure-sources.sql` is a SELECT-only production definition/ACL capture
from project `d57ddcdf-2d1b-42ec-8bfb-3484123b5ff2`, 14 November 2026. The actual
core erase, snapshot and supported count-hook bodies run in this suite. Empty
legacy table shapes and explicitly empty unrelated UC helper adapters model
their dependencies; this suite does **not** prove old UC domain erasure or
production account deletion. No production erasure is invoked.

Pinned live functions (body MD5 / pg_get_functiondef MD5):

| Function | Body | Definition |
| --- | --- | --- |
| account_deletion_erase_data(uuid,text) | a13f74f6687fff498ac1628830458560 | a496bbcd2154d994c9e83888313a84a3 |
| account_deletion_snapshot(uuid) | c6e55ea2001e24e7849875210d44baad | aaa5cc6d382e87fd1b513f0632f7ea2f |
| uc_scoped_journal_personal_counts(uuid) | f8f7b3be7cf578aafc26c66c46864ec9 | 4824a861df1f690d3c4e6b0e23a5832a |

Migration 230 preserves their owner, ACLs, configuration, ABI and volatility.
It inserts the private RTN hook **before profile deletion**, adds RTN counts to
the existing scoped-journal count extension, and adds a truthful RTN snapshot
category and unresolved-content blocker. It also pins the six new RTN writer
postimages from migrations 1200/2200 before adding actor/erasure lock fences.
Those writer pins are implementation preimages, not claims of live rollout.

Private identity inventory:

| RTN fields | Confirmed workflow treatment |
| --- | --- |
| assignments.student_id / student_user_id | Delete target assignments after target attempts; validate matching profile/user links. |
| attempts.student_user_id / answers / snapshots | Delete only target attempts; preserve their anonymous aggregate counts. |
| attempt_drafts.attempt_id | Cascade only with target attempt; no independent user UUID. |
| activity_events.learner_id | Target-only removal through reviewed quota helper. |
| monthly_completions.user_id / monthly_active_learners.user_id | Target-only removal; anonymous quota counters stay unchanged. |
| key_sets.reviewed_by / review_note | Clear actor and use exact canonical redaction note; all content stays frozen. |
| releases.published_by / release_note | Same; release IDs, dates and versions stay frozen. |
| assignments.assigned_by / settings.updated_by | Clear target attribution only; preserve all other columns. |
| check_runs.requested_by | Clear actor/tenant attribution and requester text; keep actual kind, source, result state and times. |
| rollout_events.actor_id / reason / evidence | Clear target actor and use exact canonical redaction payload; preserve stage/revision/time. |
| Other exact target UUID copies | Block for explicit retention review; do not rewrite normative material. |

The private context is owner-only, bound to actual service role, transaction,
backend PID, target user, existing pending job, full consent and revocation.
Changing the caller-visible GUC alone creates no authority. Immutable triggers
allow only target-attempt deletion or exact allowlisted author-column redaction
inside that context; no source/release deletion, grade edits or broad bypass.

Actor writes join the existing subject `42007` lock before source/organization
locks, rechecking revocation afterwards. Batch assignments sort the union of
actor and learner subjects. The existing erasure entrypoint takes organization
`42` and organization-row locks before the live ownership snapshot. Native
two-connection tests check all six actor wait/revocation races and the ownership
snapshot/concurrent shared-history race.

`erased_learning_totals.month_start` is the **attempt start cohort** in Moscow
time; it is not completion month, invoice usage or a replacement billing fact.
Only bank/release/organization/month aggregates remain, without subject,
assignment or attempt identifiers. Existing anonymous monthly activity/quota
totals remain byte-for-byte unchanged. Shared history intentionally prevents
deleting a last-owner organization; it requires ownership transfer instead.

UUID-content checks conservatively detect exact UUID links/copies. They do not
claim universal discovery of names or other free-text personal data.
