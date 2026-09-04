# Structured group schedule: SQL validation and deployment gate

Migration: `supabase/migrations/20260904095000_group_document_schedules.sql`.
No production migration or deployment was performed during this validation.

## Local execution boundary

The actual migration was executed in isolated PGlite 0.3.14 (PostgreSQL), using
Node 20.20.2 and `D:\CodexTmp\sintagma-schedule-sql-20260904\check.mjs`.
Identity helpers (`auth.uid`, owner/admin/staff permissions) are explicit local
stubs. This verifies SQL syntax, transaction checks and local RLS behavior, not
the deployed Supabase permission functions or production data.

Initial execution: 22 assertions passed, exit 0. Coverage includes persisted
JSON, clear with revision/audit retention, create-only and revision conflicts,
invalid/null/unknown/duplicate slot fields, calendar and period validation,
time ordering, changed course, tenant rejection, student denial, staff write,
RLS filtering and denied direct INSERT/UPDATE/DELETE.

The XML-text extension rejects U+0001–0008, U+000B, U+000C, U+000E–001F,
U+FFFE and U+FFFF. PostgreSQL UTF-8 already excludes NUL and surrogate code
points. TAB, LF, CR, Russian text and supplementary-plane emoji are preserved.
The harness contains eight rejection cases and a preservation assertion for
this extension. Extended execution: **31 assertions passed, exit 0**.

## Required release gate

1. Review and commit the exact migration, generated types, UI, compiler and
   tests together; run app TypeScript, focused tests, full tests and build.
2. On an authorized staging database, apply the migration once through the
   normal migration workflow. Do not copy the identity stubs to Supabase.
3. With actual owner/admin/staff/read-only/student identities, verify caller
   RLS and RPC access: read requires documents.read or documents.write; write
   requires documents.write; owner/admin are explicit alternatives.
4. Verify create, save, reload, empty-array clear, stale revision rejection,
   changed group course rejection, invalid dates and invalid XML characters.
   Check that group training_dates/schedule_text and legacy journals are unchanged.
5. Form the retained schedule DOCX from saved facts; inspect all pages and
   compare preserved ZIP parts/layout. No inferred topic, time or attendance.
6. Deploy migration before the dependent application/compiler. Confirm the
   actual public release artifact separately from a successful push/build.

Until the live migration is confirmed, the UI must report unavailability,
not a successful save. Recovery must preserve saved schedule rows and revision
history semantics; do not drop the table as a frontend rollback shortcut.
