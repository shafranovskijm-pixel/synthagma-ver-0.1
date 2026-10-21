UC015-A stores custom journal definitions, typed rows and correction history in a
parallel private registry. The old weekly journal instances/entries are untouched.
This package is SOURCE AUTHORED ONLY: no SQL, tests, native engine, TypeScript,
build, cloud, deployment or Git publication has been run for UC015.

The agreed wire is `src/lib/customJournals/contract.ts`. Two RPCs expose bounded
reads and compare-and-swap writes; direct table/helper access is owner-only even
under extra host default grants. All actions recheck current account, platform
restriction, organization-wide journals.read AND journals.write as appropriate.
An assigned teacher is not promoted to organization-wide access. Rows require a
real current same-organization subject; that identity is immutable. Organization
records without a person are intentionally deferred. A signature column is plain
unverified text and performs no signing, issuing or attestation action.

Schemas retain stable IDs and typed identities. Renaming a label or removing a
column does not rewrite old rows; a correction explicitly uses the current
schema and appends a snapshot. Stable per-ID hashes prevent type/option reuse
after an older author's free text has been erased. Journal archive changes also
create a private immutable schema/metadata version. Row archive keeps history.
Exact request replay rechecks current authority, preserves the original applied
revision and returns current entity data. Receipts contain IDs and a hash, not a
duplicate raw values/reason payload. JSON keys/types, safe integers, decimals as
strings, real local dates, time and select values are checked server-side.

Legacy inventory is paginated without requiring localStorage. Legacy cells are
read-only and are never interpreted as a typed record or a historical signature.
Import preview shows real instance/entry counts. Confirming imports only the
explicit checked definition once per organization/local ID; conflicting content
is rejected. Browser createdAt is an unverified claim, not server authorship.

Erasure is exact-reference processing, not automatic discovery of undeclared
third-party personal data in arbitrary text. The UI requires a selected subject
and says not to enter other persons' data. Subject values/history/receipts are
deleted. Each explicitly attributed author's entire schema/header/row/history
text copy is conservatively redacted and the actor reference removed. Numeric
revision/time/nonpersonal identity hashes may remain; no legal retention period
or exception is invented. All five new tables participate in personal counts and
snapshot preview; the existing revocation/write fences remain. Unattributed PII
outside the declared subject/actor boundary still requires manual resolution.

Only the actual held116 then held014 erasure predecessors are accepted:

- counts `c39e5d0a54c50d0fb7503e479509dc5a`;
- snapshot `dce5ffea181b5136a9eb82490438f962`;
- erase `80ed2a7e2fb287e272acff82f384eda0`.

The authoring script reproduces those definitions from the exact preserved UC014
transform and verifies all 31 held UC014 raw files. It does not modify UC014.
The two called UC014 personal-count/erase helpers are also source/metadata/ACL
pinned. No released115 fallback is accepted. Urgent students RPC source remains
`f38189a9960f714e43a3ebcbc60f336e`; its ledger statement is pinned to
`52b7991123db54e5e6baa856fe5ebf98` and every older ledger column is preserved.

Prepared artifacts are not authorization to execute them:

- `preflight-readonly.sql`: save actual old full-ledger hash and three old
  owner/ACL/OID/source pins immediately before any accepted release.
- `release-atomic.sql`: bounded transaction; refuses existing version, wrong
  predecessors or name/overload collisions; installs this exact canonical LF
  migration, normalizes only new ACLs, validates the finite 22-function ABI and
  new table ownership/RLS, inserts one ledger row, compares every older ledger
  row and all old function metadata/definitions (only three exact erase bodies
  may change), then commits.
- `postcheck-readonly.sql`: compare its old-ledger hash to saved preflight and
  each source/ACL result to `source-manifest.json`.
- `rollback-empty-foundation.sql`: refuses any row in any new table, source,
  ABI, ACL or ledger drift, including a missing migration015 row. Exactly one
  complete expected015 ledger row is required; absence is not an empty success.
  Restores exactly the three post014 definitions,
  drops only this empty foundation without CASCADE, removes only its exact
  ledger row and compares the entire older ledger/catalog. Populated data needs
  a separately reviewed forward repair; it is never discarded by this rollback.

The local fixture uses exact captured authority bodies and actual UC014 erasure
table definitions/helpers. Only the new UC015 erasure helper is called in the
reduced engine; old full job/snapshot/UC013+014 flows are deliberately not modeled.
The authored tests exercise wire validation, two authorized employees, negative
roles/tenant/expiry/revocation, subject integrity, CAS/replay, every scalar type,
schema changes, archive/history/keyset pages, orphan legacy inventory, no legacy
DML, inherited ACL cleanup, exact-reference erasure and rollback/collision guards.
No case is a PASS until a coordinated actual held run produces a report.

Finite source review corrected nullable legacy field validation and aligned all
new text limits with the frozen client's UTF16 code-unit bounds. A private linear
text-unit helper is the explicitly reviewed 22nd function; emoji boundary cases
roundtrip through the real strict contract in the authored SQL test. Subject
labels conservatively display at most 120 codepoints (at most 240 UTF16 units).
The server also rejects local year 0000, while the client validator may accept it;
this is a fail-closed input mismatch and cannot persist an invalid reply.

Release remains behind stable UC013 acceptance/release, then UC014 native
acceptance/release. UC015 additionally needs native PostgreSQL transaction and
lock tests, current rights changing across transactions, hostile default grants,
full account erasure/snapshot/job chain and rollback preservation, plus synthetic
teacher/learner browser acceptance on two staff sessions/devices. No real student
write, personal document, legal decision or signature is part of acceptance.
