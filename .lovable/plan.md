

## Problem

The `autoFixCourse` function has two behaviors that conflict with the user's requirements:

1. **Structure generation creates new test lessons**: When `needsStructure` is true, the `generate-course-structure` edge function generates a full course structure including `test` type lessons. These get inserted even though the course already has tests.

2. **Question generation for empty tests**: The code generates new AI questions for tests that have zero questions in the DB. The user says tests already have questions imported — they just need correct answers filled in.

The user's expectation is simple:
- Tests are already in the course with questions — **only solve them** (fill `correct_answer`)
- Fill empty text/practice lessons with content
- **Never** create new test lessons or new test questions

## Plan

### 1. Filter out test lessons from structure generation (AdminMarketplaceManager.tsx ~line 216)

When inserting newly generated lessons, filter out any with `type === "test"` — only insert `text` and `practice` lessons:

```typescript
const newLessons = generatedLessons
  .filter(gl => !existingTitles.has(gl.title.toLowerCase()))
  .filter(gl => gl.type !== "test"); // Never create new tests
```

### 2. Remove the "generate questions for empty tests" block (lines 294-326)

Delete the entire `testsWithNoQuestions` block that calls `gigachat` with `action: "generate_questions"`. Tests should already have their questions; the system should only solve existing unanswered questions.

### 3. Clean up related code

- Remove `testsWithNoQuestions` variable (line 253) and its inclusion in `totalTasks` (line 267)
- Remove the re-fetch logic for `freshUnanswered` (lines 330-335) since there are no newly generated questions to catch
- Simplify back to using `unansweredQuestions` directly

### Result

The autofix pipeline becomes:
1. Generate text/practice structure if needed (no tests)
2. Fill empty text/practice lessons with content
3. Solve existing unanswered test questions
4. Fix duplicate titles

