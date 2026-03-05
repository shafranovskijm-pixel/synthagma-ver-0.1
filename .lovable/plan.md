

## Plan: Fix Bulk Content Generator — 3 Issues

### Problems identified

1. **Content is duplicated across lessons** — the AI prompt for each lesson doesn't include context about what other lessons cover, so it generates similar text. Need to pass a list of all lesson titles + already-generated topics so each lesson gets unique content.

2. **Tests not solved** — existing courses have test lessons with Ростехнадзор questions already loaded in `test_questions` table. The bulk generator currently skips test lessons entirely (`filter(l => l.type !== "test")`). Need to include test lessons and use the existing `gigachat` edge function (action: `generate_answers`) to solve them — same logic as `TestAnswersDialog.handleAutoGenerate`.

3. **Practice content not generated** — practice lessons are inserted with placeholder content `[{"type":"heading1","content":"Практическое задание"}]` which is truthy, so they're excluded from the "needs content" filter. The `isPractice` detection also fails because these lessons already have content and are skipped before reaching that check.

4. **Test naming/ordering** — structure generation should name the final test "Итоговое тестирование" and ensure it's always last.

### Changes

**1. `supabase/functions/generate-course-structure/index.ts`**
- Update prompt: final test must be titled "Итоговое тестирование" and always be the last lesson

**2. `supabase/functions/generate-lesson-content/index.ts`**
- Add a `previousLessons` parameter to the request body
- Include the list of already-processed lesson titles in the user prompt so the AI knows what's already covered and generates unique content for each lesson

**3. `src/components/admin/BulkContentGenerator.tsx`**
- **Include test lessons in the list** — remove the `filter(l => l.type !== "test")`, show all lesson types
- **Fix practice detection** — treat lessons with only the placeholder content as needing generation (check if content is just the placeholder heading)
- **Add test solving phase**: after content generation, for each test lesson that has questions in `test_questions`, call `gigachat` with `action: "generate_answers"` to get correct answers, then update `test_questions.correct_answer` for each question
- **Pass previous lesson titles** when generating content — accumulate titles of already-processed lessons and send them to `generate-lesson-content` as `previousLessons` array
- **Add "Тест" badge** in lesson list for test-type lessons
- **Structure insert**: when inserting generated structure, keep practice type as "text" but ensure test is named "Итоговое тестирование" at the end

### Processing flow
```text
Phase 1 (Structure, if empty):
  Generate structure → insert lessons

Phase 2 (Content for text/practice):
  For each lesson (with previousLessons context):
    generate-lesson-content → unique blocks
    generate-image → illustration
    Save to DB
    Add title to previousLessons list

Phase 3 (Solve tests):
  For each test lesson:
    Fetch test_questions for lesson
    Call gigachat (generate_answers) → correct answers
    Update test_questions with correct_answer + explanation
```

