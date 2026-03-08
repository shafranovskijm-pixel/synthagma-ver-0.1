

## Plan: Auto-fix after "Проверить все"

Currently, "Проверить все" validates all courses and shows a toast with a "🔧 Исправить все ИИ" button requiring manual click. The user wants it to automatically trigger the fix when errors are found.

### Changes

**File: `src/components/admin/AdminMarketplaceManager.tsx`** (lines 268-277)

Replace the toast with action button by directly calling `handleBulkAutoFix(failedCourses)` when `errCount > 0`:

- Show an info toast saying validation found errors and auto-fix is starting
- Immediately call `handleBulkAutoFix(failedCourses)` without waiting for user click
- Keep the success toast when no errors are found

This is a ~5-line change in the `handleBulkValidate` function, replacing the `toast.error` block (with action button) with a `toast.info` + direct `handleBulkAutoFix()` call.

