

## Проблема

Валидация курса обнаруживает «Нет изображений в уроках» (строка 382) → показывает ⚠️. При нажатии «Исправить» вызывается `autoFixCourse`, но `totalTasks` (строка 635) **не учитывает отсутствие медиа**. Когда текст/тесты/вопросы в порядке, `totalTasks === 0` → функция возвращает «Нечего исправлять», **не доходя** до кода обогащения на строке 808.

## Решение

**Файл: `src/components/admin/AdminMarketplaceManager.tsx`**

1. **Перенести проверку `lessonsNeedingMedia`** (строки 808-825) **выше** — до подсчёта `totalTasks` (перед строкой 635). Это включает:
   - Загрузку контента уроков (`freshLessons`)
   - Проверку наличия блоков `image`/`slider`
   - Формирование массива `lessonsNeedingMedia`

2. **Добавить в `totalTasks`** учёт медиа:
```typescript
const totalTasks = emptyLessons.length 
  + (unansweredQuestions.length > 0 ? 1 : 0) 
  + (duplicateGroups.length > 0 ? 1 : 0) 
  + emptyTests.length
  + (lessonsNeedingMedia.length > 0 ? 1 : 0);
```

3. **На строках 808-825** убрать дублирующий код (уже выполнен выше), оставить только `lessonsToEnrich = lessonsNeedingMedia.slice(0, 3)` и далее генерацию.

Это гарантирует, что при отсутствии изображений функция не выходит раньше времени и запускает обогащение.

