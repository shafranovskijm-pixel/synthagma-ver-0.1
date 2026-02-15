

## Plan: Marketplace Enhancements - Resale Rights, Buy Button, Balance Top-Up, and Admin Crediting

### Overview

Enhance the marketplace order flow so that:
1. The order form explicitly states that the buyer can resell/use the course however they want (resale rights clause)
2. A "Buy" button appears alongside "Leave Request" for instant purchase from balance
3. Organizations can top up their balance directly from the marketplace
4. Admin panel already has crediting functionality (OrgBalanceManager) -- we verify it works and enhance if needed

---

### 1. Add Resale Rights Notice to Order Dialog

In the order dialog (`CourseStoreManager.tsx`, lines 310-338), add an info block stating:

> "After purchase, the course becomes your property. You can use it for training your students, resell it, or use it at your discretion."

This will be a styled info card inside the order form, visible to organization buyers.

### 2. Add "Buy" Button (Instant Purchase from Balance)

Currently, the course detail page (lines 124-131) only has "View" and "Leave Request" buttons. Changes:

- **Course detail view**: Add a "Buy" button next to "Leave Request" that directly opens the order dialog with `payFromBalance` pre-enabled
- **Catalog card view**: Add a small "Buy" action button on each card
- The existing balance payment logic in `useCourseStoreManager.ts` already handles deduction -- we just need a more prominent entry point

### 3. Add "Top Up Balance" Button in Marketplace

In the marketplace header area (`CourseStoreManager.tsx`, line 57-63):

- Show current balance next to the store title
- Add a "Top Up" button that opens a top-up dialog (reuse logic from `useOrgBalance` hook)
- Import and use `useOrgBalance` directly in `CourseStoreManager` for the top-up functionality

### 4. Admin Balance Crediting

The admin panel already has `OrgBalanceManager` with a "Top Up" button under the Balance tab in `OrganizationDetailsView.tsx`. This is the crediting functionality. No changes needed unless we want to add additional features.

---

### Technical Details

**Files to modify:**

1. **`src/components/organization/CourseStoreManager.tsx`**
   - Add balance display + top-up button in the header
   - Add "Buy" button in course detail view and catalog cards
   - Add resale rights notice in order dialog
   - Add top-up dialog (inline, using `useOrgBalance` hook)

2. **`src/hooks/useCourseStoreManager.ts`**
   - Add a `handleBuyNow` method that pre-sets `payFromBalance = true` and opens order dialog

3. **`src/components/organization/tabs/TabContentRenderer.tsx`**
   - Pass `orgBalance.refresh` so balance updates after top-up

**No database changes needed** -- all tables and columns already exist.

**Key UI additions:**
- Balance card in marketplace header: wallet icon + amount + "Top Up" button
- "Buy" button (green/primary) next to "Leave Request" in course detail
- Resale rights info block: a bordered card with info icon and text about full ownership rights
- Top-up dialog: amount input + comment + submit (reuses `useOrgBalance.topUpBalance`)

