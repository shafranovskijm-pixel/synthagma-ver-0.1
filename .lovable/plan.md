

## Исправление: презентация не должна перекидывать на следующий урок

### Проблема

`markLessonComplete()` всегда вызывает `goToNextLesson()` в конце (строка 660). Когда `useEffect` автоматически вызывает `markLessonComplete()` для презентации — студент сразу перебрасывается на следующий урок, не успев посмотреть слайды.

### Решение

Добавить параметр `autoAdvance = true` в `markLessonComplete()`. При автозавершении презентации передавать `false`, чтобы галочка ставилась, но переход не происходил.

### Изменения

| Файл | Что меняется |
|------|-------------|
| `src/hooks/useCourseLearning.ts` | `markLessonComplete(autoAdvance = true)` — вызывать `goToNextLesson()` только если `autoAdvance === true` |
| `src/pages/CourseLearning.tsx` | В `useEffect` для slider вызывать `markLessonComplete(false)` — отметить без перехода |

