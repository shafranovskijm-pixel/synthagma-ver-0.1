

## Plan: Fix — Content Not Generated When Course Has Only Test Lessons

### Root Cause

The course was imported with **only test lessons** (Ростехнадзор questions). The condition on line 343 `if (!hasLessons)` checks `lessons.length > 0` — since test lessons exist, it's `true`, so **structure generation is skipped entirely**. No text/practice lessons are created, so Phase 2 has 0 targets. Only Phase 3 (solve tests) runs.

### Fix

**`src/components/admin/BulkContentGenerator.tsx`**

1. **Change structure generation condition**: Instead of `!hasLessons`, check if there are **no non-test lessons**. If all existing lessons are tests, we still need to generate the text/practice structure:
   ```
   const hasContentLessons = lessons.some(l => l.type !== "test");
   if (!hasContentLessons) { generateStructure(); }
   ```

2. **Update `generateStructure`**: When test lessons already exist, don't create a new test — only insert the text/practice lessons. The structure generator should skip inserting a test lesson if one already exists in the course.

3. **Merge fresh lessons with existing tests**: After structure generation, reload all lessons (including existing tests) so Phase 2 processes new text lessons and Phase 3 processes existing test lessons.

4. **Fix `totalToProcess` display**: Currently shows "0 к генерации, 0 тестов" even when test is present — ensure counts use the correct source data before pipeline starts.

### Changes summary

| File | Change |
|------|--------|
| `BulkContentGenerator.tsx` | Replace `!hasLessons` with `!hasContentLessons` check; filter out test type from structure insert when tests exist; ensure fresh data flows to all phases |

