

## Plan: Fix test ordering + improve image prompts + verify full pipeline

### Problems identified

1. **Test stays at order_index 0** — The DB confirms the test lesson in the screenshot's course still has `order_index: 0`. The reorder code was added but either didn't execute (pre-fix generation) or silently failed. The fix needs to be more robust.

2. **Image prompt is too generic** — Currently: `"Образовательная иллюстрация для урока: ${lesson.title}"`. Should be derived from the generated content for relevance.

3. **Full pipeline needs verification** — Structure → Content (with images) → Tests should work as one click.

### Changes

**File: `src/components/admin/BulkContentGenerator.tsx`**

#### 1. Fix test ordering (more robust)

In `generateStructure()`, after inserting new lessons and reordering tests, also reload and re-assign sequential `order_index` to ALL lessons to guarantee correct ordering:

```typescript
// After inserting new lessons, reorder everything:
// 1. Fetch all non-test lessons ordered by order_index
// 2. Fetch all test lessons
// 3. Assign sequential order_index: non-tests first (0..N-1), tests at end (N..N+T-1)
const { data: allLessons } = await supabase
  .from("lessons")
  .select("id, type, order_index")
  .eq("course_id", courseId)
  .order("order_index");

if (allLessons) {
  const nonTests = allLessons.filter(l => l.type !== "test");
  const tests = allLessons.filter(l => l.type === "test");
  const ordered = [...nonTests, ...tests];
  for (let idx = 0; idx < ordered.length; idx++) {
    if (ordered[idx].order_index !== idx) {
      await supabase.from("lessons")
        .update({ order_index: idx })
        .eq("id", ordered[idx].id);
    }
  }
}
```

This replaces the current test-reorder logic (lines 166-174) and is bulletproof — all non-test lessons come first, all tests go to the end, with sequential indices.

#### 2. Smarter image prompts

After generating text content for a lesson, extract key topics from the first 2-3 blocks to build a contextual image prompt:

```typescript
// Extract key content for image prompt
const textContent = blocks
  .filter(b => b.type === "paragraph" || b.type === "heading1" || b.type === "heading2")
  .map(b => b.content)
  .join(" ")
  .slice(0, 300);

const imagePrompt = `Профессиональная образовательная иллюстрация. Тема: ${lesson.title}. Ключевые понятия: ${textContent}. Стиль: чистая инфографика, схема или диаграмма для учебного курса по промышленной безопасности.`;
```

This gives the image model much better context from the actual generated content.

#### 3. Verify pipeline flow

The `startFullPipeline` logic is correct:
- Phase 1 (structure) runs only if `!hasContentLessons` (only tests exist, no lectures)
- Phase 2 (content) generates text + image for each lecture/practice
- Phase 3 (tests) solves existing test questions via AI

No changes needed to the pipeline flow itself — the phases are already chained correctly with `freshLessons` passed between them.

### Summary

Two targeted changes in one file:
1. Replace test reorder logic with robust "all non-tests first, then tests" reindexing
2. Use generated content to build better image prompts

