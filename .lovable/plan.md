

## Bulk Content Pipeline Widget

### What it does
A card widget at the top of the Catalog tab that sequentially processes all "В работе" courses one by one. When you click "Запустить", it:
1. Picks the next unvalidated course
2. Generates content for empty text/practice lessons
3. Solves unanswered test questions
4. Validates the course and marks it as `is_validated = true`
5. Moves to the next course, showing real-time progress

### UI Design
A `Card` above the course list with:
- Total courses in pipeline / completed count
- Progress bar
- Current course name being processed
- Log of completed courses with checkmarks
- Start/Stop button

### Technical Plan

**1. New component: `src/components/admin/BulkPipelineWidget.tsx`**

A self-contained widget that:
- Receives `courses` (the "В работе" list from `h.groupedCourses`)
- Has state: `isRunning`, `currentIndex`, `currentCourseName`, `completedCourses[]`, `currentPhase` (structure/content/tests/validate)
- On start, iterates through unvalidated courses sequentially
- For each course, reuses the same logic as `autoFixCourse`:
  - Fetch lessons → generate structure if needed (no tests) → fill empty content → solve unanswered questions → validate → mark `is_validated`
- Shows progress via `Progress` bar and a scrollable log
- Calls `onComplete` callback to refresh the parent data

**2. Integration in `AdminMarketplaceManager.tsx`**

- Add `<BulkPipelineWidget>` at the top of the catalog `TabsContent`, above the search bar
- Pass unvalidated courses from `h.courses.filter(c => !c.is_validated)`
- On completion, call `h.fetchData()` to refresh grouping

**3. Progress display**
- `{completedCount} / {totalCount}` with percentage
- Current phase text: "Генерация контента: Урок X", "Решаю тесты", "Проверка..."
- Completed courses list with green checkmarks
- Ability to stop mid-process

