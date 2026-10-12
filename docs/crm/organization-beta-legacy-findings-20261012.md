# Legacy organization CRM findings, 2026-10-12

These findings explain why S-048 uses a separate narrow organization workspace. They do not claim the old defects were fixed. Existing administrative/platform CRM tables, policies, RPCs and Edge functions remain unchanged in this release. No exploitation or business-data mutation was performed.

Confirmed in the authenticated metadata capture at `D:/Codex/work/sintagma-queue/work/s048-crm-beta-20261012/catalog.json`:

1. `sales_tasks_sm_insert/select/update/delete`, `sales_leads_sm_all` and `sales_lead_activities_sm_all` check only `is_active_sales_manager(auth.uid())`, without a tenant predicate. `sync_org_staff_to_sales_managers()` provisions that active manager record for organization staff with the CRM-task flag or sales-manager role. These permissive policies therefore affect organization staff, not just platform staff. Source: migrations `20260707125018...` and `20260426051607...`.
2. `list_org_task_assignees(uuid)` is SECURITY DEFINER and reads names/email for the supplied organization without caller permission, expiry or deletion checks. The new workspace uses its own private scoped assignee helper; it does not call this legacy RPC.
3. Legacy organization policies on leads/tasks/activities use profile-first `current_organization_id()` and do not separate `sales.read` and `sales.write`.
4. `claim_sales_leads(uuid[])` is SECURITY DEFINER; its UPDATE has no organization predicate. Its activity insert also targets `notes` with type `claim`, unlike the audited activity table's `description` column and allowed types. A failed RPC transaction should roll back its UPDATE; the metadata alone is not proof that a cross-organization write succeeded.

Confirmed in source call chains reachable from the unused `OrgSalesManager`:

- `SalesKanban.tsx` derives cards from documents and leads. Dragging to “На подписи” writes a contract status of `signed`; it is not an independent persisted deal stage. `Deals360.tsx` also attaches all organization subscription invoices to the largest client deal and adds both accepted proposals and signed-contract amounts. These are unsuitable as customer CRM/payment evidence.
- `LogActivityDialog.tsx` tries to read/create a global `sales_managers` profile; ordinary organization staff lack those global table permissions. Its lead lookup and `DealCommunication.tsx` history lookups do not take an organization filter. `SalesTasks.tsx` calls `fetchLeads()` without the organization filter.
- `convert-company-to-lead/index.ts` uses a service-role client without an in-handler caller authorization check and inserts the converted lead without organization scope. Source inspection does not establish the deployed gateway configuration or whether that endpoint is publicly reachable. It is not connected to the new workspace.

The saved extra read-only probe reported zero legacy lead/task/activity rows for the organization examined for S-048. This is only that organization's captured state, not a platform-wide assertion. No legacy migration/import is included.

Resolving the legacy shared-platform policy and RPC defects is a separate change requiring its own owner/staff/platform regression coverage. Hiding or replacing the organization UI does not itself remove old API exposure.
