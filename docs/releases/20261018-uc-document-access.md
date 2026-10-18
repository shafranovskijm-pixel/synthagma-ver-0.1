# UC-002 / UC-003 / UC-005: document access boundaries

Prepared against production metadata read on 2026-10-18. This change is local until the reviewed release is applied. No production document, object, number or identity was modified during preparation.

## Included change

`20261018100000_uc_document_access_boundaries.sql` replaces the reviewed permissive policies on 13 document tables with the existing canonical owner/staff permission model, additionally rejecting revoked accounts. Organization reads require `documents.read`, writes require `documents.write`. Expired staff membership cannot authorize either. Learners retain read access to their own enrollment documents and records, and upload/update/delete access to their own identity documents with a matching organization. Company account owners retain read access to their company's documents. Platform admins retain access through the canonical gate.

The affected tables are `org_documents`, `incoming_documents`, `education_document_records`, `document_issuance_log`, `program_documents`, `program_folders`, `program_categories`, `program_training_plans`, `frdo_signed_documents`, `student_documents`, `student_identity_documents`, `company_documents`, and `group_documents`. All existing restrictive policies remain unchanged. Group document inserts/updates remain RPC-only; no new FRDO delete permission is added.

The existing `issue_education_document_batch`, `create_group_document_batch` and `get_next_document_number` functions receive an active `documents.write` gate. Their ownership, SECURITY DEFINER configuration and existing business algorithms remain unchanged. Anonymous execution is revoked. An authenticated or service-role request with no actual authenticated user cannot allocate numbers. The issuer keeps exact course/enrollment/group validation, transaction lock, unique indexes and replay behavior.

Two private Storage buckets receive tenant ownership checks for reads and writes, with restrictive guards so another permissive policy cannot reopen access:

| Bucket / path | Authoritative relation |
| --- | --- |
| `student-documents/<user UUID>/...` | Profile organization; an exact existing identity-document reference can resolve a missing profile. Conflicting organization mappings are denied. |
| `student-documents/students/<enrollment UUID>/...` | Enrollment → course → organization. Student may read their own issued document; organization document writers may upload. |
| `student-documents/avatars/<user UUID>.<extension>` | Same user/profile organization rules. |
| `student-documents/support/<user UUID>/...` | Same user, or platform admin. |
| `company-documents/<company UUID>/...` | Company → organization; company account owner has read-only access. |

The migration does not move, rename, delete or backfill objects. An unresolvable company prefix remains visible only to a platform admin. Malformed/traversal paths are rejected. Existing Storage/account deletion, Goreltech, intake, library and final-photo restrictions remain in place.

`billing-documents` receives an INSERT-only canonical document-write policy and restrictive boundary for `<organization UUID>/...` and `organizations/<organization UUID>/...`. The organization must exist. Existing SELECT/UPDATE/DELETE policies are unchanged. This matches the user-authorized PDF renderer; it does not authorize arbitrary admin paths or broaden modification of existing files.

## Fresh production evidence

Read-only aggregate snapshots are saved outside the repository under `work/uc-release-20261018/backend-*.json`:

- 642 student objects. All 642 resolve to one organization using profile plus exact identity-document reference; no conflicting or absent mapping. Four lack a profile but have an exact identity-document reference. No inference from an uploader's current organization is used.
- Three objects in the dedicated `company-documents` bucket have no company/profile/organization/enrollment prefix match and no exact company-document reference. No ownership is invented; administrator reconciliation remains necessary.
- The `documents` bucket referenced by `useCompanyDetailManager` does not exist in production. There are zero objects/company paths there; none of the 108 Storage policies names that exact bucket. This is a broken UI upload destination, not evidence of another public bucket. The companion UI fix must use the existing private `company-documents` bucket and company UUID path, and resolve read URLs through signed access.
- `student-documents`, `company-documents` and `billing-documents` are private. This migration verifies their private flags but does not change them.

## Validation

Run from the repository root with the existing Node 20 runtime:

```text
node node_modules/vitest/vitest.mjs run supabase/functions/_shared/uc-document-access.sql.test.ts --maxWorkers=1
```

42 tests pass against PGlite executing the actual migration, actual captured canonical access helpers, exact existing affected policies, and actual issuer/number/group RPC definitions. Unrelated helper bodies used only by other buckets are false stubs; those features are not claimed as integration-tested.

The suite covers owner/admin/multi-organization document writer, read-only/expired/revoked staff, same-tenant learner, other tenant, company recipient, anonymous and NULL-user cases; direct record mutation bypass; unknown/conflicting Storage ownership; malformed paths; broad permissive-policy overlap; billing's two path layouts; and preservation of the existing Goreltech fence. A valid first issuer item followed by an invalid enrollment rolls back both the record and both number counters. Repeat issuance returns the same original record. A synthetic late failure after the migration's postcheck rolls back its complete function/policy/ACL change and leaves historical sentinel rows, objects and counters identical.

PGlite is single-session: no multi-session PostgreSQL race proof is claimed. Existing issuer transaction advisory locks, atomic counter upsert and uniqueness remain unchanged. Number allocation intentionally advances on each authorized invocation; only issuance of the existing original enrollment record is idempotent.

## Release checks and limits

Apply in the reviewed transaction before the companion signature/version migrations (`101000`, `102000`) and UI/Edge rollout. The migration aborts on unreviewed function body or permissive-policy baseline, disabled RLS, missing deletion fences or unexpected bucket privacy. It is ledger-applied once; blindly rerunning after success intentionally fails the original-baseline check.

Before applying, rerun the aggregate ownership SELECTs and exact preflight against the deployment target. After applying, verify all 13 tables still have enabled RLS and their original restrictive deletion policy; Storage has four `uc_document_objects_*_guard` policies plus `uc_billing_document_upload_guard`; anonymous EXECUTE is absent from all three patched RPCs; document/object/sequence row counts and saved hashes are unchanged. Smoke-test legitimate learner own read/upload and multi-org staff document upload using the ordinary UI. Do not manufacture issuance or sequence allocation for production acceptance.

No historical data repair is bundled. The four student objects whose profiles no longer exist remain readable by the scoped organization through exact identity-document references; editing identity metadata without its profile is denied until explicit reconciliation. Three company objects require separate ownership evidence. Previously issued signed URLs may remain usable until their existing expiry; no URL token revocation is claimed.

This is an authorization foundation. Completion/attestation decision validation, removal of writer-supplied issuance semantics, trustworthy delivery evidence, final educational facts, and historical correction workflows remain separate roadmap items. Authorized document writers retain the existing classroom/manual workflow; this release does not declare active enrollments eligible for issuance merely because their rows exist. Signature integrity and organization-document version retention belong to the companion migrations.
