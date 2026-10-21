# UC014 foundation — local semantics pass, release held

This package adds prospective technical evidence and an independently authorized human assessment decision to the existing student results and programme facts panels. The existing visual components are reused. It does not replace legacy completion, document issuance, numbering, signatures or protocols. UC019 remains responsible for that later boundary.

The organization explicitly drafts and approves versioned criteria: main assessment, pass rule, rounding and retake policy, optional module requirements, reviewer, decision actors and any recognition sources. Missing legal or organizational choices remain draft or unknown. There is no universal 70% rule, invented commission, automatic signature or legal attestation date.

Genuinely new test sessions can receive an immutable context for one exact current UC111 enrollment/programme snapshot. Old or resumed sessions are never backfilled. Multiple eligible group associations remain ambiguous. A newly approved criterion never silently repins an existing context. A human-only assessment starts a prospective unknown context only through an explicit staff capture using the latest approved criterion.

The technical result reads original session and grade facts. It never regrades current questions, rewrites grades, completes an enrollment or issues a document. Retake comparison uses normalized percentages; current module progress is labeled as a current observation and requires explicit human confirmation. A machine result alone is never an attestation decision.

Human decisions require current `students.write` and `documents.write`, current exact-group teacher assignment where applicable, explicit inclusion in the approved decision actors, current source evidence, CAS and request identity. Recognition additionally requires current independently authorized access to an approved file version. Changed recognition proof makes the historical decision visibly stale and rejects an old recognition receipt replay. Learner projections omit private staff reasons and actor/authority details.

Six new RLS tables are private, including to service-role direct access. Only two authenticated RPCs are public. Unexpected default grants are removed only from the new objects. Six-table personal counting and validated erasure extensions cover both subjects and criterion/decision actors; old erasure bodies are patched only from exact captured released115 or held116 predecessors. The latter is a finite integration input, not evidence of UC013 deployment or acceptance.

## Files and evidence

- Migration: `supabase/migrations/20261020140000_uc_learning_outcome_foundation.sql`.
- SQL semantics fixture and test matrix: `supabase/functions/_shared/uc-learning-outcomes.fixture.ts` and `uc-learning-outcomes.sql.test.ts`.
- Actual captured source/DDL metadata and finite erasure predecessors: `supabase/tests/fixtures/uc-learning-outcomes-*.json`. Capture used five read-only metadata SELECTs and one database-status read; the fifth adds the exact otherwise uncaptured photo-object helper. No business rows or student PII.
- Frontend contracts, actor/scope guards, hooks, minimal panels and tests: the 17-file hold at workspace `work/resume-20261020/uc014-frontend-authoring-hold.json`.
- Independent bounded SQL source review: workspace `work/resume-20261020/uc014-sql-independent-source-review-final.json`. This is source review only.
- `source-manifest.json` pins canonical LF and raw source separately. Native execution must use canonical LF consistently because preflight compares exact original definitions.

The isolated branch starts from `04febc6e424e922ed37d1f57f7a5afb0b39361db`; it is deliberately not synchronized with later urgent releases during authoring. Integrate from freshly verified main after review, preserving the urgent `20261020050000_students_page_scope_evaluation` ledger entry and its live RPC. Do not reset or modify the separate dirty UC013 checkout or its frozen evidence.

## Prepared rollback

`rollback-empty-foundation.sql` is an atomic, fail-closed rollback for a still-empty new foundation. It locks the original session table before the six new tables, refuses any existing new business rows, checks the 26 exact helper/API bodies and relevant metadata/ACLs, checks the unchanged 16 access/test bodies, restores only one of the exact three-function erasure predecessor variants, and removes only the new observer, guards, functions and tables. There is no `CASCADE`. Only the exact UC014 ledger row may be removed; all other ledger contents are compared before and after. Unexpected dependencies or source drift abort the transaction.

The rollback is prepared source, not executed or accepted. Once real results exist, use a separately reviewed forward repair or preservation plan; do not weaken the empty-data refusal. The author-only `.mjs` writer reads local source and the existing `.py` template as text. It does not execute Python, SQL, tests or network calls. An initial Python interpreter process exited `0xC0000005` before creating artifacts; it was not retried and that failure is retained in the workspace evidence.

## Actual local validation

The focused PGlite matrix passed all 39 scenarios on the final source (actual exit 0). All seven frontend files passed 58 assertions: 42 in the four primary files and 16 in the criteria/integration files. The final total is 97 distinct assertions with zero skipped. The reports, logs, timings and earlier failures remain in workspace `work/resume-20261020/uc014-*-tests*`; `uc014-local-validation-readout.json` identifies the exact files and source pins.

The first SQL setups failed before business assertions due to captured foreign-key installation order, an unparenthesized PL/pgSQL CASE and a missing synthetic lesson argument. The next actual matrix exposed two setup permission errors; those were corrected using the actual eligible teacher and public programme RPC result, preserving the denial checks. The first frontend run found a real nested HTTP-status overwrite; the client now treats outer 401/403 as authoritative and preserves nested error status. All earlier failures are retained. No passing coverage is attributed to failed setup.

These are synthetic local semantics and UI checks. They include actual original test-session/grade/photo-object definitions and an empty-only rollback against the released115 fixture. They do not prove real Auth, native concurrency, the held116 predecessor, full photo/quota/worker lifecycles or production behavior.

## Acceptance gates still pending

- Independent review of the frozen complete implementation and prepared rollback.
- Native checks of both erasure predecessors, current role/default-grant metadata, exact rollback restoration, preserved start/resume/photo/quota behavior, membership/actor erasure races and row-lock ordering.
- UC013 integration and release first, fresh live source/ledger metadata, explicit forward migration version review, strict closure build and production browser acceptance.

Local SQL/UI passes are confirmed above. Build, native execution, production deployment, full UC014 acceptance and original UC013 N07/native26 credit remain unclaimed.
