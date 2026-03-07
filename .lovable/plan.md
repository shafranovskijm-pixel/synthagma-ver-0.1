

## Исправить предпросмотр кабинета ученика + тултипы на все кнопки

### Проблема 1: Курсы в предпросмотре
В режиме предпросмотра `useStudentDashboard` загружает реальные данные текущего пользователя (админа). Нужно показывать демо-данные.

### Проблема 2: Тултипы
Только 2 кнопки из ~10 имеют тултипы. Нужно добавить на все остальные.

---

### Изменения

**`src/hooks/useStudentDashboard.ts`**

В `loadData()`, если `isPreviewMode === true`, не делать запросы к БД, а установить демо-данные:

```typescript
if (isPreviewMode) {
  setCourses([
    { id: "demo-1", title: "Пример курса", description: "Демонстрационный курс", duration: "2ч", progress: 35, totalLessons: 10, completedLessons: 3, status: "in_progress", skip_video_identification: false },
    { id: "demo-2", title: "Второй курс", description: "Ещё один пример", duration: "4ч", progress: 0, totalLessons: 8, completedLessons: 0, status: "in_progress", skip_video_identification: false },
  ]);
  setTotalTimeSpent(3600);
  setTotalCompletedLessons(3);
  setProfile({ full_name: "Иванов Иван Иванович", organization_name: organizationName, organization_id: null });
  setLoading(false);
  return;
}
```

Проблема: `isPreviewMode` устанавливается в отдельном `useEffect`, а `loadData` вызывается по `effectiveUserId`. Нужно передать флаг preview через ref или проверять `localStorage` напрямую в `loadData`.

**`src/components/organization/tabs/StudentsTab.tsx`**

Обернуть в `<Tooltip>` все кнопки без тултипов:
- Зачислить → «Зачислить выбранных учеников на курс»
- Логины → «Создать логины и пароли»
- На почту → «Отправить данные для входа на почту»
- Отчислить → «Отчислить выбранных из курса»
- ФРДО → «Экспорт данных для ФРДО»
- Удалить → «Удалить выбранных учеников»
- Приказ → «Сгенерировать приказ»
- Протокол → «Сгенерировать протокол»
- Группы → «Управление группами учеников»

Использовать один `<TooltipProvider>` на весь блок фильтров вместо отдельных обёрток.

