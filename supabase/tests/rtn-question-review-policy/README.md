# Question review policy v2 fixture

This disposable lab loads released prerequisite **DDL and synthetic seed only**.
It does not run the previous acceptance suites, access the official website,
connect to production, modify installed migrations, or create real users.

Run the new cases locally with the existing dependencies:

```text
python scripts/test-rtn-question-policy-sql.py --prepare-only
node supabase/tests/rtn-question-review-policy/run-pglite.mjs
```

The first PGlite receipt proves 26 new functional, authority, privacy and metadata
cases on one synthetic connection. A separate `--delta-only` run proves one new
R1→R2 release transition, including grading R1 after R2 publication and preserving
the submitted R1 row. The original 26 cases need not be repeated for that delta.
Neither receipt proves concurrency.

The native runner refuses a non-loopback, non-fresh database. Use PostgreSQL17
with `PGDATABASE=rtn_question_policy_lab_ci`, then run:

```text
python scripts/test-rtn-question-policy-sql.py
```

In addition to the functional cases it observes two actual sessions. Each
contender must be waiting on the recorded blocker's PID before a changed source
or corrected normalization is committed. The operation must then reject new
admission with22023 and preserve assignments, attempts and monthly usage.

The migration keeps old key sets and their seven-day policy unchanged. Only a
new, substantiated v2 review receives an immutable sidecar. Routine review dates
become reminders for those editions; actual legal end dates remain hard limits.
No fixed legal end is presented as “valid forever”. Source errors neither renew
approval nor fabricate successful verification. New source/normalization changes
require a new review. Existing active attempts and results retain their snapshots.
