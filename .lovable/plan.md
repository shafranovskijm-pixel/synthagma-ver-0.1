## Проблема

Когда организация добавляет курс из магазина:
- В режиме **«Список»** курс появляется (с категорией «—»).
- В режиме **«Сетка» (плитки)** курс **не виден** до жёсткой перезагрузки.

## Причина

В `src/hooks/useCourseStoreManager.ts` (handleOrder, ~стр. 263-270) при клонировании курса в организацию-покупателя поле `category_id` копируется как есть со всеми остальными полями исходного курса:

```ts
const { id, created_at, updated_at, ...courseData } = origCourse;
await supabase.from('courses').insert({
  ...courseData,             // ← сюда попадает category_id чужой организации
  organization_id: organizationId,
  source_order_id: orderData.id,
  source_course_id: originalCourseId,
})
```

В режиме «Сетка» группировка `catalogCoursesByCategory` (CoursesTab.tsx, стр. 365-376) делает так:
- курсы с `category_id` распределяются по категориям организации-покупателя;
- если `category_id` курса не совпадает ни с одной категорией покупателя — курс **не попадает ни в одну группу** (и не падает в «Без категории», т.к. `category_id !== null`) → исчезает из сетки.

В режиме «Список» курсы рендерятся плоско, поэтому курс виден (с прочерком в столбце «Категория»).

После Ctrl+Shift+R ничего волшебного не происходит — просто пользователь думает, что курс появился, потому что:
1. либо открыл другой режим, 
2. либо событие `org-courses-refresh` сработало, но проблема группировки осталась — курс всё равно скрыт в сетке.

## Решение

**Один маленький фикс** в `src/hooks/useCourseStoreManager.ts`, в `handleOrder`:

При клонировании курса жёстко обнулить `category_id` (категория исходной организации не имеет смысла у покупателя). Курс попадёт в группу «Без категории», и пользователь сможет переместить его в нужную свою категорию через троеточие → «Переместить в категорию».

```ts
const { id, created_at, updated_at, category_id, ...courseData } = origCourse;
await supabase.from('courses').insert({
  ...courseData,
  category_id: null,
  organization_id: organizationId,
  source_order_id: orderData.id,
  source_course_id: originalCourseId,
})
```

Заодно проверю, что после клонирования событие `org-courses-refresh` уже диспатчится (оно есть на строке 308) и `useCourses.refresh()` вызывает повторный запрос — это работает корректно. Никаких других изменений не требуется.

## Файлы

- `src/hooks/useCourseStoreManager.ts` — обнулить `category_id` при клонировании курса покупателю.
