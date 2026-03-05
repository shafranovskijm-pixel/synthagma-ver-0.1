

## Plan: Course validation check on click in marketplace catalog

### What it does
When clicking on a course title in the marketplace list, the system runs a quick validation:
1. **Lectures have content** — checks that all text/practice lessons have non-empty `content`
2. **No duplicate lessons** — checks for lessons with identical titles
3. **Tests have answers** — checks that test lessons have at least 1 question with a `correct_answer` set

If all checks pass → the row gets a green checkmark (✅) indicator. If issues found → shows a toast with a summary of problems.

### Changes

**File: `src/components/admin/AdminMarketplaceManager.tsx`**

1. Add state `validatedCourses: Record<string, 'ok' | 'error'>` to track validated courses
2. Add `validateCourse(courseId)` async function that:
   - Fetches all lessons for the course
   - Checks: empty content on text/practice lessons, duplicate titles, test lessons with no questions or unanswered questions
   - Returns `{ ok: boolean, issues: string[] }`
3. Make the course title in `renderCourseRow` clickable — on click calls `validateCourse`
4. Show a small colored dot/icon next to the title based on validation result (green ✅ if ok, red ⚠ if issues)
5. Show toast with issues list if validation fails

### Technical details

```typescript
// Validation function
async function validateCourse(courseId: string) {
  const { data: lessons } = await supabase
    .from("lessons").select("id, title, type, content").eq("course_id", courseId);
  
  const issues: string[] = [];
  
  // Check empty content
  const emptyLessons = lessons?.filter(l => 
    (l.type === "text" || l.type === "practice") && (!l.content || l.content === "[]")
  );
  if (emptyLessons?.length) issues.push(`${emptyLessons.length} уроков без контента`);
  
  // Check duplicates
  const titles = lessons?.map(l => l.title) || [];
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
  if (dupes.length) issues.push(`Дубликаты: ${[...new Set(dupes)].join(", ")}`);
  
  // Check test answers
  const testIds = lessons?.filter(l => l.type === "test").map(l => l.id) || [];
  if (testIds.length) {
    const { data: questions } = await supabase
      .from("test_questions").select("id, lesson_id, correct_answer").in("lesson_id", testIds);
    const testsWithNoQ = testIds.filter(id => !questions?.some(q => q.lesson_id === id));
    const unanswered = questions?.filter(q => q.correct_answer === null || q.correct_answer === undefined);
    if (testsWithNoQ.length) issues.push(`${testsWithNoQ.length} тестов без вопросов`);
    if (unanswered?.length) issues.push(`${unanswered.length} вопросов без ответа`);
  }
  
  return { ok: issues.length === 0, issues };
}
```

The title in the row becomes clickable with a cursor pointer. After validation, a persistent green/red dot appears next to the title until the page is refreshed.

