

## Plan: Remove Test Generation Phase from BulkContentGenerator

### What's changing
The user confirmed that test questions already exist in courses — they only need to be answered by students. So Phase 3 (test question generation) should be removed entirely.

### Changes to `src/components/admin/BulkContentGenerator.tsx`

1. **Remove `"tests"` phase and `"generating_questions"` status**:
   - `Phase` type: remove `"tests"` → becomes `"idle" | "structure" | "content" | "complete"`
   - `LessonStatus` type: remove `"generating_questions"`
   - Remove `PHASE_LABELS["tests"]`

2. **Remove `generateTests()` function** entirely (~30 lines)

3. **Remove Phase 3 call from `startFullPipeline()`** — after content generation, go straight to `"complete"`

4. **Remove test-related retry logic from `retryErrors()`** — the `if (lesson.type === "test")` branch

5. **Remove test phase indicator from UI** — the third phase pill ("Тесты") and its arrow separator

6. **Remove `testLessons` computed variable** and its Badge in the controls section

7. **Filter out test lessons from the lesson list** — only show `text`/`practice`/`lesson` types, since test lessons don't need content generation

8. **Update `totalToProcess` calculation** — only count content targets (no test targets)

This simplifies the pipeline to 2 phases: Structure (if empty) → Content generation.

