

## Plan: Move existing test lesson to the end after structure generation

### Problem
When the course has only a test lesson (e.g., imported Ростехнадзор questions) and AI generates the structure, new lessons are inserted with `order_index` 0, 1, 2... but the existing test keeps its original `order_index` (likely 0 or 1). After reloading, the test appears near the top instead of at the end.

### Fix

**File: `src/components/admin/BulkContentGenerator.tsx`** — in `generateStructure()`:

1. Assign `order_index` for new lessons starting from 0 sequentially
2. After inserting new lessons, update existing test lessons' `order_index` to be **after** all new lessons (e.g., `newLessonsCount + originalIndex`)
3. This ensures the test always appears last in the list

Specifically, after the insert of `lessonsToInsert` (line ~163), add an update query:

```typescript
// Move existing test lessons to the end
if (existingTestCount > 0) {
  const testLessonIds = lessons.filter(l => l.type === "test").map(l => l.id);
  for (let t = 0; t < testLessonIds.length; t++) {
    await supabase.from("lessons")
      .update({ order_index: lessonsToInsert.length + t })
      .eq("id", testLessonIds[t]);
  }
}
```

This is a ~5-line addition in one file.

