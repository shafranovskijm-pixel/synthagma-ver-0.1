

## Plan: Return to admin panel when exiting course view in admin mode

### Problem
When an admin views a course (from marketplace or organization details) and clicks "Back", they get redirected to `/organization` instead of back to `/admin`. Only `useCourseBuilder.ts` checks `adminViewAsOrg` — other pages (`CourseEditor`, `CoursePreview`, `CourseImport`, `ContractEditor`) hardcode `/organization`.

### Solution
Create a shared utility function `getBackPath()` and use it in all course-related pages:

```typescript
// Helper: check if admin is viewing as org
function getAdminAwareBackPath(defaultPath = "/organization") {
  if (localStorage.getItem("adminViewAsOrg")) return "/admin";
  return defaultPath;
}
```

### Files to change

1. **`src/lib/utils.ts`** — Add `getAdminAwareBackPath()` helper

2. **`src/pages/CourseEditor.tsx`** — Replace all `navigate("/organization")` with `navigate(getAdminAwareBackPath())`

3. **`src/pages/CoursePreview.tsx`** — Same replacement for back buttons (~3 places)

4. **`src/pages/CourseImport.tsx`** — Same replacement (~2 places)

5. **`src/pages/ContractEditor.tsx`** — Same replacement (1 place)

6. **`src/hooks/useCourseBuilder.ts`** — Simplify existing `getBackPath()` to use the shared helper

This ensures any "back" navigation from course pages respects the admin viewing context and returns to `/admin` (where the marketplace tab was active).

