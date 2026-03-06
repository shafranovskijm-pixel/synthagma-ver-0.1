

## Проблема

При массовом импорте из Excel (`BulkCourseImporter.tsx`, строка 124) все вопросы создаются с `correct_answer: 0` вместо `null`. Далее pipeline (`BulkPipelineWidget.tsx`, строка 311) проверяет `correct_answer === null`, видит `0` (не null) и пропускает вопросы, считая их решёнными.

**Масштаб**: 11,051 из 11,263 вопросов во всех курсах маркетплейса имеют `correct_answer = 0` (ответ A). Это затрагивает ВСЕ импортированные курсы, не только «Правила работы с персоналом».

## Решение (2 части)

### 1. Исправить код — предотвратить повторение

| Файл | Изменение |
|------|-----------|
| `src/components/admin/BulkCourseImporter.tsx` (стр. 124) | Изменить `correct_answer: 0` → `correct_answer: null` |
| `src/components/admin/BulkPipelineWidget.tsx` (стр. 311) | Добавить проверку на подозрительные ответы: если ВСЕ вопросы урока = 0, считать их нерешёнными |
| `src/components/admin/AdminMarketplaceManager.tsx` (стр. 150) | Аналогичная проверка подозрительных ответов |

### 2. Миграция БД — сбросить фейковые ответы

SQL-миграция: для всех вопросов в курсах маркетплейса, у которых `correct_answer = 0` и `explanation IS NULL` (ИИ всегда ставит explanation), сбросить `correct_answer` в `null`, чтобы pipeline мог решить их заново.

```sql
UPDATE test_questions SET correct_answer = NULL
WHERE id IN (
  SELECT tq.id FROM test_questions tq
  JOIN lessons l ON l.id = tq.lesson_id AND l.type = 'test'
  JOIN marketplace_courses mc ON mc.course_id = l.course_id
  WHERE tq.correct_answer = 0 AND tq.explanation IS NULL
);
```

Также сбросить `is_validated = false` для всех затронутых курсов, чтобы они вернулись «В работу»:

```sql
UPDATE marketplace_courses SET is_validated = false
WHERE course_id IN (
  SELECT DISTINCT l.course_id FROM test_questions tq
  JOIN lessons l ON l.id = tq.lesson_id
  WHERE tq.correct_answer IS NULL
);
```

### 3. Улучшить детекцию «нерешённых» вопросов

В pipeline добавить эвристику: если в уроке все вопросы имеют одинаковый `correct_answer` и нет `explanation`, считать их нерешёнными. Это защитит от повторения проблемы.

```typescript
// Вместо простой проверки на null:
const unanswered = (questions || []).filter((q: any) => 
  q.correct_answer === null || q.correct_answer === undefined
);

// Добавить проверку подозрительных ответов:
const byLesson = new Map<string, any[]>();
for (const q of questions || []) {
  const arr = byLesson.get(q.lesson_id) || [];
  arr.push(q);
  byLesson.set(q.lesson_id, arr);
}
const suspicious = new Set<string>();
for (const [lessonId, qs] of byLesson) {
  const allSame = qs.every(q => q.correct_answer === qs[0]?.correct_answer);
  const noExplanations = qs.every(q => !q.explanation);
  if (allSame && noExplanations && qs.length > 3) suspicious.add(lessonId);
}

const unanswered = (questions || []).filter((q: any) =>
  q.correct_answer === null || q.correct_answer === undefined || suspicious.has(q.lesson_id)
);
```

### Порядок выполнения
1. Миграция БД — сбросить `correct_answer` и `is_validated`
2. Исправить `BulkCourseImporter` — `null` вместо `0`
3. Улучшить детекцию в `BulkPipelineWidget` и `AdminMarketplaceManager`
4. После этого запустить конвейер заново — он решит все 11 000+ вопросов через ИИ

