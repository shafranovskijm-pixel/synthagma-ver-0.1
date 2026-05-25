## Проблема

Поток: выделить ученика → нажать «Зачислить» → выбрать курс → нажать «Зачислить на курс» → **ничего не происходит**, диалог остаётся открытым.

### Причина

В `StudentsTab.tsx` чекбокс выбора ученика хранит **`user_id`** (строка 191 — `Array.from(selectedStudentIds)` передаёт user_id'ы).

Эти id-шники прокидываются в `enrollmentActions.setSelectedStudentIds(...)` → дальше `bulkEnroll()` вызывает `getSelectedUserIds(d.students)`:

```ts
for (const student of students) {
  const hasUserId = selectedStudentIds.has(student.user_id);
  const hasEnrollmentId = student.enrollment_id && selectedStudentIds.has(student.enrollment_id);
  if (hasUserId || hasEnrollmentId) userIds.add(student.user_id);
}
```

`d.students` приходит из `useOrganizationDataLoader` (отдельный snapshot), а `StudentsTab` рендерится из **своего** инстанса `useStudents` (`src/api/students.ts`). Это два разных запроса с разной фильтрацией/таймингом — при первом открытии вкладки или после refresh ученик может быть виден в таблице, но ещё/уже отсутствовать в `d.students`. Тогда `getSelectedUserIds` возвращает `[]` → `bulkEnroll` ругается тостом «Выберите учеников» и **не закрывает диалог** — пользователь видит «опять предлагает выбрать курс».

## Исправление

Только фронтенд, бизнес-логику не трогаем.

### 1. `src/hooks/useEnrollmentActions.ts`

В `getSelectedUserIds` добавить fallback: если ни одна запись в `students` не совпала, считать сами `selectedStudentIds` как user_id'ы (новый UI всегда хранит именно их). Так мы не зависим от того, успел ли `useOrganizationDataLoader` дотянуть свой snapshot.

```ts
const getSelectedUserIds = useCallback((students: Student[]): string[] => {
  const userIds = new Set<string>();
  for (const student of students) {
    const hasUserId = selectedStudentIds.has(student.user_id);
    const hasEnrollmentId = student.enrollment_id && selectedStudentIds.has(student.enrollment_id);
    if (hasUserId || hasEnrollmentId) userIds.add(student.user_id);
  }
  // Fallback: если в snapshot'е students никого не нашли,
  // selectedStudentIds — это user_id'ы из StudentsTab (новый формат выбора).
  if (userIds.size === 0 && selectedStudentIds.size > 0) {
    const enrollmentIds = new Set(students.map(s => s.enrollment_id).filter(Boolean));
    for (const id of selectedStudentIds) {
      if (!enrollmentIds.has(id)) userIds.add(id); // отсеиваем явные enrollment_id
    }
  }
  return Array.from(userIds);
}, [selectedStudentIds]);
```

### 2. `src/hooks/useEnrollmentActions.ts` — `bulkEnroll`

После успешной вставки (или если все уже зачислены) — гарантированно закрывать диалог и сбрасывать выбор курса, чтобы пользователь не видел «опять предлагает выбрать курс» без явной обратной связи. Сейчас при ошибке/нулевом результате диалог не закрывается; добавим закрытие в `finally`, если вставка прошла без исключения.

Минимально: при `newUserIds.length === 0` уже закрываем — оставляем. При ошибке валидации («Выберите учеников») — диалог оставляем открытым, но логируем в console для диагностики.

### 3. Диагностика

Добавить `console.warn` в `bulkEnroll`, когда `userIds.length === 0`, с дампом `selectedStudentIds` и количества `students` — чтобы в следующий раз сразу видеть причину в консоли.

## Технические детали

- Файлы: `src/hooks/useEnrollmentActions.ts` (один файл).
- Без миграций, без изменений RLS, без изменений API.
- Бизнес-логика (правила зачисления, генерация приказа) — не меняется.

## Проверка

1. Выделить одного ученика без зачислений → «Зачислить» → выбрать курс → «Зачислить на курс» → тост «Зачислено 1 учеников», диалог закрывается, ученик появляется на курсе.
2. То же для ученика, уже зачисленного на этот курс → тост «Все выбранные ученики уже зачислены», диалог закрывается.
3. Массовое зачисление 2+ учеников — продолжает работать как раньше.