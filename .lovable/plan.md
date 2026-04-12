

## Plan: Fix Admin Custom Limits Not Saving

### Problem
Two issues prevent setting unlimited (-1) values for students/storage from the admin panel:

1. **`type="number"` input quirk**: Typing `-1` in number inputs is unreliable across browsers — the minus key behavior varies. The value shows as `-1` text rather than `∞`.
2. **Values not persisting**: The database shows all custom override columns as `null` even after saving. The `as any` cast hides potential update errors.

### Solution

**File: `src/components/admin/OrganizationDetailsView.tsx`**

1. **Replace number inputs with text inputs + toggle buttons**: For each limit field, add a toggle button "∞" (unlimited). Clicking it sets the value to `-1`. The input itself becomes `type="text"` with validation to accept only numbers or empty string.

2. **Display `-1` as "∞"**: When the stored value is `-1`, show the infinity symbol in the input and highlight the unlimited toggle.

3. **Fix the save function**: Remove `as any` cast, ensure the update payload matches the actual column names. Add proper error logging to catch save failures.

4. **Add proper initialization**: When the component loads with existing `-1` values from the database, display them correctly as `∞`.

### Specific changes

- Change all 5 limit inputs from `type="number"` to `type="text"` with numeric validation
- Add an "∞" toggle button next to each input — clicking sets value to `-1` (unlimited), clicking again clears it
- When value is `-1`, show "∞" in the input field and disable manual editing
- Fix `saveTariffSettings` to properly handle the update without `as any`
- In `useSubscriptionLimits.ts` — verify the fetch query includes all custom columns (already done from previous edit)

### Files modified
| File | What |
|------|------|
| `src/components/admin/OrganizationDetailsView.tsx` | Fix inputs to support -1/unlimited, fix save logic |

### No database changes needed
The columns already exist in the `organizations` table.

