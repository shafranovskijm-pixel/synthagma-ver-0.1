

# Plan: Reorganize Admin Panel — Remove Tariffs Tab, Move Documents

## What changes

### 1. Remove "Тарифы" from admin sidebar and dashboard
- **`src/components/admin/AdminSidebar.tsx`**: Remove the "Тарифы" button (lines 96-99), remove `"tariffs"` from `AdminTabType`
- **`src/pages/AdminDashboard.tsx`**: Remove the `TariffsManager` import and its rendering (`activeTab === "tariffs"`), remove from `getTabTitle()`
- Tariff info for each organization is already available in the organization detail view

### 2. Move "Документы для организаций" to per-organization settings
- **`src/components/admin/OrganizationDetailsView.tsx`**: Add a new tab or section for billing documents (invoice/receipt/act uploads) scoped to that specific organization
- **`src/components/admin/TariffsManager.tsx`**: Extract the billing documents section (lines ~480-685) into a reusable component, then remove it from TariffsManager (which will be deleted entirely)

### 3. Clean up
- Delete or empty `src/components/admin/TariffsManager.tsx` since nothing remains
- Remove unused imports (`Crown` icon if no longer used)

## Files affected
- `src/components/admin/AdminSidebar.tsx` — remove tariffs tab
- `src/pages/AdminDashboard.tsx` — remove tariffs rendering
- `src/components/admin/OrganizationDetailsView.tsx` — add billing documents section
- `src/components/admin/TariffsManager.tsx` — extract documents component, then delete

