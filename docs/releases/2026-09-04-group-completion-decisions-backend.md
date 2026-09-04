# Explicit group completion decisions — local backend contract

Migration: `supabase/migrations/20260904190000_group_completion_decisions.sql`.
This document describes source code, not a production deployment or legal approval.

## Scope and authority

The first implementation is limited to the existing exact GORELTECH organization
UUID `7237f9d4-3670-4a19-8946-a43c68fd3473`, INN `7806541216` and the existing client
name check. Both RPCs derive the actor from `auth.uid()`. Only `authenticated`
receives EXECUTE; a service key with no actor is not a fallback. The Edge compiler
must forward the validated caller JWT when reading.

Writes require owner/admin, or a currently nonexpired `org_staff` membership and
`documents.manage`. Reads also accept `documents.read` with current membership.
These permissions mean the platform permits the operation; they do not verify a
person's legal signing authority, a commission's composition or an e-signature.

## Read

`read_group_completion_decisions(p_organization_id uuid, p_group_id uuid) → jsonb`

```ts
{
  organization_id: string;
  can_manage: boolean;
  group: {
    id: string; organization_id: string; course_id: string | null;
    name: string; start_date: string | null; end_date: string | null;
  };
  students: Array<{
    user_id: string; full_name: string | null;
    enrollments: Array<{
      id: string; user_id: string; course_id: string; status: string;
      progress: number; started_at: string; completed_at: string | null;
      document_facts_revision: string;
    }>;
    decision: Decision | null;
  }>;
}
```

All source rows are read in one MVCC SQL statement. Only current nonarchived
profiles in the exact organization/group are returned, and enrollment rows are
scoped to the group's tenant-validated course and exact user. Every matching
enrollment is returned: the UI must not silently select the newest of several.
Stale decisions are deliberately returned, not erased or automatically reused.
There are no passport, SNILS, email or unrelated student-document queries.

## Confirm/update

`save_group_completion_decision` parameters (all mandatory except the final three):

```text
p_organization_id uuid
p_group_id uuid
p_user_id uuid
p_expected_enrollment_id uuid
p_expected_enrollment_revision text
p_expected_course_id uuid
p_expected_start_date text             -- nullable, exact YYYY-MM-DD otherwise
p_expected_end_date text               -- nullable
p_expected_decision_revision integer   -- null only for first confirmation
p_grade_text text
p_issuance_decision text
p_protocol_number text = null
p_protocol_date text = null
p_decision_note text = null
```

The response is one `Decision`:

```ts
{
  id: string; organization_id: string; group_id: string; user_id: string;
  enrollment_id: string; enrollment_facts_revision: string; course_id: string;
  group_start_date: string | null; group_end_date: string | null;
  grade_text: string; issuance_decision: "with_document" | "without_document";
  protocol_number: string | null; protocol_date: string | null;
  decision_note: string | null; revision: number;
  confirmed_by: string; confirmed_at: string;
}
```

`grade_text` is mandatory, nonblank and at most **100 Unicode codepoints**. There
is no inferred grade scale. Both issuance choices require explicit confirmation;
no record means no decision. Protocol number (200 codepoints), protocol date and
note (1000 codepoints) are optional, not generated. Whitespace-only optional text
becomes null; other input text is retained as entered. All text must be XML 1.0
safe; values such as `[[TOKEN]]` are legitimate text, not instructions.

The RPC locks the group, course, matching active profile, exact enrollment rows
and current decision. It rejects ambiguous profiles/enrollments and changed
course, period, enrollment UUID/source revision or decision revision. A sole
enrollment must have status `active` or `completed`; manual decisions do not
require fabricated online progress for face-to-face teaching. Dates can be
absent, but when present must be real ISO dates with start <= end. Any subsequent
group-period change makes the old confirmation stale.

## Persistence, invalidation and audit

`group_completion_decisions` stores the latest row with a stable UUID and a unique
organization/group/user key. Every successful insert/update adds its full record
to `group_completion_decision_history`, keyed by decision ID and revision.
History UPDATE/DELETE is prohibited; clients have no direct table privileges.
There are no cascading source foreign keys, so archive/move/delete does not erase
the audit. This first interface does not expose deleted-group history to the UI.

`enrollments.document_facts_revision bigint NOT NULL DEFAULT 0` is additive;
existing migrated rows start at zero without rewriting business values. Every
subsequent INSERT or UPDATE that explicitly targets a non-telemetry column receives
a fresh positive bigint from the dedicated
`public.enrollment_document_facts_generation_seq` (NO CYCLE), including same-value
resets (`SET progress=progress`), identity/access changes, direct source-token
writes and physical DELETE/INSERT reusing the same UUID. The
sequence is independent of any enrollment row and must not be reset. Supplied
revision values cannot reset it. The trigger is SECURITY DEFINER with a fixed
search_path and explicit sequence name; clients have no sequence privileges.
No other enrollment fields are assigned, and confirming a decision never writes
an enrollment or issues a document. Bigints are exposed as decimal strings:
these are opaque source tokens, not per-row update counts. Rolled-back writes can
consume tokens; callers must compare equality rather than expect consecutive values.

The trigger uses PostgreSQL `BEFORE INSERT OR UPDATE OF ...`. Its column list is
generated from `pg_catalog.pg_attribute` in ordinal order with `quote_ident`,
including every current, non-dropped enrollment column **except `time_spent` and
`updated_at`**. Statements updating only those telemetry fields preserve the
token, whether values change or stay equal. This permits learners to revisit
completed lessons without silently invalidating an operator's decision. A mixed
`SET time_spent=..., progress=progress` still rotates the token: statement targets,
not value differences, determine whether the guard runs. No learner-interface or
time-accounting function was changed, and the trigger never overwrites business
values.

**Schema maintenance:** a later migration that adds an enrollment column must
recreate `zz_enrollment_document_facts_revision` using the refreshed catalog-derived
list in this migration. PostgreSQL does not automatically add future columns to
an existing `UPDATE OF` trigger. Verify the trigger's `tgattr` against the current
non-dropped columns minus the two telemetry exceptions before deploying such a
schema change. Do not change this to an OLD/NEW-equality filter: that would lose
protection for explicit same-value resets.

Consumers may classify a student only when decision identity, source revision,
current group course/period and unique eligible enrollment all still match.
Non-telemetry enrollment writes conservatively require reconfirmation. Do not call
that an automatic or permanent finalization. SQLSTATE `40001` denotes changed source/CAS;
`42501` denotes denied or mismatched scope; `22023` denotes invalid input. After a
transport failure, reread instead of automatically retrying a new confirmation.

Group-period matching remains current-value equality, not a historical group
generation counter. A privileged database restore/sequence reset is outside the
ordinary insert/update guarantee and must be included in release/restore procedures.

## Local verification

Harness: `D:/CodexTmp/verify-group-completion-decisions-20260904.mjs`.
Report: `D:/CodexTmp/group-completion-decisions-sql-proof-20260904.json`.
Actual synthetic RPC outputs: `D:/CodexTmp/group-completion-decisions-sql-contract-20260904.json`.
These are local PostgreSQL/PGlite checks with fixture auth/helper/source tables,
not production permission proof or concurrent PostgREST load testing. Deployment
still requires schema/trigger/helper review and a separately coordinated release.

Latest scoped run: **134 checks passed, process exit 0** against the telemetry-fixed
migration SHA-256 `e68b096418e7f152bd46766aa8834c66fd7910dbd561c344f077b2d24be1ea56`.
The actual SQL checks include catalog/trigger column parity, changed and unchanged
time-only writes, combined time/updated-at writes, mixed telemetry with an explicit
same-value progress reset, every guarded column's same-value update, attempted
source-token overrides, physical delete/reinsert, and preservation of business
values. The expanded fixture includes an `updated_at` column solely to exercise
that supported telemetry case. It is not a claim that production has that column.

Proof JSON SHA-256:
`146D43809D4F715A7E699B79E48C8D50FECCFB4584FE884D552ABC94CBF9FDD1`.
Actual synthetic RPC contract SHA-256:
`5B86DC85F77630B5059BB665152F3C7F881B2FE140804148081C792DDB5F1972`.
