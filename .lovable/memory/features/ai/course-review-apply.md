---
name: AI Course Review with Apply
description: AI-проверка курса возвращает структурированные patches; кнопка «Применить» вызывает edge apply-review-finding
type: feature
---
- `review-course` (GigaChat tool-calling) дополнительно требует поля `target_kind` (test_question|lesson_title|none), `target_id` и `patch`. В промпт уроков и вопросов теста подставляются `[lesson_id=...]` / `[question_id=...]`.
- Edge `apply-review-finding` проверяет `has_org_staff_permission(courses.manage)` или `has_admin_staff_role`, валидирует принадлежность вопроса/урока курсу, применяет патч (поля test_questions: question/explanation/correct_answer/options; lessons.title).
- Перед самой первой AI-проверкой в курсе делается snapshot `before_ai_review` (см. course-snapshots-versioning) — это страховка от любых применённых правок.
- Хук `useCourseReview` хранит `appliedIds`, метод `applyFinding(courseId, finding)`. Карточка `FindingCard` показывает кнопку «Применить» только когда `target_kind != none` и `patch` непуст.
