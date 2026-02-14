

## Plan: Marketplace Course Management in Admin Panel + Organization Balance System

### Overview
Two new features for the admin panel:
1. **Admin Marketplace Manager** -- create/manage courses for the marketplace directly from the admin panel (similar to how organizations do it, but without organization binding)
2. **Organization Balance System** -- a balance field on organizations that admins can top up, and organizations can spend on marketplace course purchases

---

### Phase 1: Database Changes

**1.1 Add `balance` column to `organizations` table**
```sql
ALTER TABLE public.organizations 
  ADD COLUMN balance NUMERIC NOT NULL DEFAULT 0;
```

**1.2 Create `balance_transactions` table for audit trail**
```sql
CREATE TABLE public.balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,          -- positive = top-up, negative = purchase
  type TEXT NOT NULL,               -- 'topup', 'purchase', 'refund'
  description TEXT,
  related_order_id UUID REFERENCES marketplace_orders(id),
  performed_by UUID,                -- admin user_id for top-ups
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;
```

RLS: admins can do everything; organizations can SELECT their own transactions.

**1.3 Allow `marketplace_courses` without `organization_id` (admin-created)**

Currently `organization_id` is NOT NULL. Admin-created courses need a way to be attributed. Two options:
- Option A: Make `organization_id` nullable (admin courses have NULL org).
- Option B: Create a special "platform" organization for admin courses.

**Chosen: Option A** -- add nullable support and adjust RLS so admins can insert with `organization_id = NULL` and all users can see such courses in the catalog.

```sql
ALTER TABLE public.marketplace_courses ALTER COLUMN organization_id DROP NOT NULL;
```

Update the "Anyone can view active marketplace courses" policy to also show admin courses (org_id IS NULL).

---

### Phase 2: Admin Panel -- Marketplace Tab

**2.1 New sidebar tab: "Маркетплейс"**
- Add `"marketplace"` to `AdminTabType` in `AdminSidebar.tsx`
- Add a `Store` icon button in the sidebar nav

**2.2 New component: `src/components/admin/AdminMarketplaceManager.tsx`**

Tabs inside:
- **Каталог** -- view all marketplace courses (from all orgs + admin-created)
- **Создать курс** -- form to create a new course directly for the marketplace:
  - Title, description, lessons (simplified -- or link to course builder)
  - Prices for students and organizations
  - Toggle active/inactive
- **Заявки** -- view and manage all marketplace orders across all organizations

The admin creates a `course` record (with `organization_id = NULL` or a platform org), then lists it in `marketplace_courses`.

**2.3 New hook: `src/hooks/useAdminMarketplace.ts`**
- Fetch all marketplace courses (with org names)
- CRUD for admin-created courses
- Manage orders globally

---

### Phase 3: Admin Panel -- Balance Management

**3.1 Add balance display and top-up in `OrganizationDetailsView.tsx`**
- Show current balance in the organization details
- "Top up balance" button with amount input
- Transaction history table

**3.2 New component: `src/components/admin/OrgBalanceManager.tsx`**
- Balance display with formatting
- Top-up dialog (amount + description)
- Transaction history with filters
- On top-up: INSERT into `balance_transactions` + UPDATE `organizations.balance`

**3.3 New hook: `src/hooks/useOrgBalance.ts`**
- `topUpBalance(orgId, amount, description)` -- inserts transaction + updates org balance
- `fetchTransactions(orgId)` -- returns transaction history
- `deductBalance(orgId, amount, orderId)` -- for purchases

---

### Phase 4: Organization-side Balance Integration

**4.1 Show balance in organization dashboard**
- Display current balance in the stats area or header
- Show balance in the CourseStoreManager when ordering

**4.2 Payment via balance in `useCourseStoreManager.ts`**
- Add "Pay from balance" option in the order dialog
- Check sufficient balance before allowing purchase
- On order: deduct balance, create transaction, create order with status "paid"

---

### Phase 5: Wire Everything Together

**5.1 Update `AdminDashboard.tsx`**
- Import and render `AdminMarketplaceManager` for the new tab

**5.2 Update `AdminSidebar.tsx`**
- Add "marketplace" tab type and button

**5.3 Test scenarios**
- Admin creates a marketplace course
- Admin tops up org balance
- Organization purchases course using balance
- Transaction history is accurate

---

### Technical Summary

| Item | Action |
|---|---|
| DB migration | Add `balance` to orgs, create `balance_transactions`, make `marketplace_courses.organization_id` nullable |
| New files | `AdminMarketplaceManager.tsx`, `OrgBalanceManager.tsx`, `useAdminMarketplace.ts`, `useOrgBalance.ts` |
| Modified files | `AdminSidebar.tsx`, `AdminDashboard.tsx`, `OrganizationDetailsView.tsx`, `useCourseStoreManager.ts`, `OrgDashboardHeader.tsx` |
| RLS policies | balance_transactions (admin full, org select own), updated marketplace_courses policies |

