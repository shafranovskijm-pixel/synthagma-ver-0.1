

## Plan: Persist validation status, add accordion grouping to admin catalog

### 3 Changes

**1. Add `is_validated` column to `marketplace_courses` table**

DB migration to add a boolean `is_validated` column (default `false`) to persist the validation checkmark status per course.

```sql
ALTER TABLE public.marketplace_courses ADD COLUMN is_validated boolean NOT NULL DEFAULT false;
```

**2. Persist validation in `useAdminMarketplace.ts` + `AdminMarketplaceManager.tsx`**

- When `handleValidateCourse` succeeds (no issues), save `is_validated = true` to the DB via `supabase.from("marketplace_courses").update({ is_validated: true }).eq("course_id", courseId)`.
- On load, initialize `validatedCourses` state from the fetched `is_validated` field on each course.
- If validation finds issues, set `is_validated = false` in DB.

**3. Restore accordion grouping in admin catalog list view**

Replace the flat `Table` in `AdminMarketplaceManager.tsx` list view (lines 233-250) with the accordion/Collapsible structure matching the first screenshot:
- Top-level group "Курсы Ростехнадзора" with collapsible subcategories
- Each subcategory shows its courses in a table with the same action icons
- Uses `h.groupedCourses` which already exists in the hook
- Badge with course count per group/subgroup

The grouping logic already exists in `useAdminMarketplace.ts` (`groupedCourses` with `subGroups`), so we just need to wire the UI.

### Files to modify

- **Migration**: Add `is_validated` column
- **`src/hooks/useAdminMarketplace.ts`**: Save/load `is_validated` from DB on validation
- **`src/components/admin/AdminMarketplaceManager.tsx`**: Restore accordion UI for list view, use persisted validation state

