# S-049: explicit organization CRM links and factual history

Adds optional `company_id`, `student_user_id`, `linked_at` to the existing CRM client. A client has at most one source, and each organization/source has one client. Links are explicit by existing UUID, never by name, email or INN. Reading a card creates nothing. Attaching an existing unlinked CRM client preserves its fields and notes; creating from a company copies its name/INN, from a student only its name. These are CRM snapshots, not live synchronization of source identity. Company/profile rows are not changed.

`org_crm_link_subject(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_client_id uuid DEFAULT NULL)` returns `{id, updated_at}`. Types are `company` and `student`; student ID is `profiles.user_id`, not `profiles.id`. Null client creates on this explicit write only; retry returns the existing link. An explicit different client cannot replace an existing link. The source/context advisory lock, source share lock, client update lock and unique partial indexes serialize competing links. Previously linked orphans retain `linked_at` and cannot be attached to a new person/company.

`org_crm_context(p_organization_id uuid, p_entity_type text, p_entity_id uuid)` returns:

```text
{ subject: {type,id,name,profile_id|null}, client: OrgCrmClient|null,
  related_company: {id,name,client_id|null}|null,
  crm: {clients,deals,tasks,activities,assignees,counts,truncated},
  timeline: {events:[{id,occurred_at,source,kind,title,description|null}],
             total,truncated,restricted_sources,unavailable_sources} }
```

Context requires the existing CRM plan/revocation gate and `sales.read`, plus `companies.read` or `students.read`. Linking requires `sales.write` plus the same source read permission. Source membership is checked against the current organization on every call. Students must pass the existing `is_student_profile`, must not be removed from the roster, and must not have revoked accounts. Related employer identity is separately hidden without `companies.read`; employer CRM work is not mixed into the student's own CRM arrays.

The five existing CRM RPCs and their ACLs are unchanged. `org_crm_snapshot` already projects `to_jsonb(SELECT *)`, so the three additive fields appear automatically; its mutation allowlists still reject link fields. Scoped context queries run before caps, independently of the organization's first 1,000 clients. Deals/tasks cap at 1,000, activities and combined history at 500, with exact permission-filtered totals and explicit truncation.

History uses persisted CRM creation/completion dates and manual notes (`source=crm`); enrollment `started_at`/`completed_at` (`learning`); same-user, explicit same-organization login/course-access logs (`activity`); and document creation/upload dates (`documents`). A course-access log also requires its course to belong to the organization. Unknown/null-organization logs are not attributed to the current tenant. Educational document linkage uses explicit user ID or, only where user ID is null, an exact same-tenant enrollment. Deleted company/education records are excluded. Document branches require `documents.read` before event counts or projection. Educational `issue_date` is described as a recorded date, not converted into an invented event timestamp. Manual email/call notes are not delivery/call proof. No past deal stages, payment, signatures, private messages, secrets, file URLs, IP addresses or user agents are inferred or returned. This is a view of currently stored facts, not a complete immutable audit trail.

Both source foreign keys use `ON DELETE SET NULL`. The existing account deletion snapshot receives exactly one shared-data list entry, `('org_crm_clients','student_user_id')`, so normal self-deletion first reports the existing shared-data review blocker instead of claiming that copied CRM identity was erased. No existing deletion logic, ACL, owner, profile or role is otherwise changed. The test verifies the exact one-entry difference and its count contribution; it does not execute the entire legacy account deletion workflow.

## Local verification

Run one PGlite process at a time and avoid a simultaneous production build:

```powershell
& 'D:/Codex/tools/node-v22.23.2/node-v22.23.2-win-x64/node.exe' supabase/tests/prepare-org-crm-links.mjs D:/Codex/work/sintagma-queue/work/s049-crm-links-20261012/catalog-complete.json
& 'D:/Codex/tools/node-v22.23.2/node-v22.23.2-win-x64/node.exe' supabase/tests/test-org-crm-links.mjs D:/Codex/work/sintagma-queue/work/s048-crm-beta-20261012/catalog.json D:/Codex/work/sintagma-queue/work/s048-crm-beta-20261012/catalog-extra.json D:/Codex/work/sintagma-queue/work/s049-crm-links-20261012/catalog-complete.json
```

The isolated runner passes 80 assertions, all 13 new atomic postchecks and all 38 prior CRM baseline postchecks. It verifies ledger failure rollback/replay rejection, helper drift, permission/tenant isolation, current source membership, nonstudent/removed/revoked denial, idempotency and uniqueness, orphan protection, unchanged snapshot fields, domain-filtered factual history and honest caps. Synthetic business records roll back. True parallel database connections are not simulated; the serialization locks and unique constraints are reviewed separately. `validation.json` records actual results.

## Production procedure

1. Save `backup-before.sql` output. Run `preflight.sql` against the approved project. Its 19 exact existing function/body/ACL guards and required column/policy checks use the fresh catalog, including the separately verified revocation UUID column.
2. Review tracked migration `20261012210000_org_crm_links.sql`, `expected-release.json` and the atomic `release-transaction.sql`. Execute the whole transaction as one SQL-editor request. It locks the normal release/migration ledger, refuses replay, applies the exact source, records that source in the existing ledger and raises on failed checks before commit.
3. Verify the returned 13 checks, exact ledger source, and preserved existing functions/ACLs, table grants/RLS, policies and user triggers. Publish the matching frontend and verify its public assets and actual company/student card UI separately.

No production mutation, email, ordinary-data migration or credential operation is performed by the package generator or isolated test. Production publication and real user acceptance remain separate gates.
