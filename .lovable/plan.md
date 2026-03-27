

## Добавить «Группы» в модальное окно курса и зачисление групп

### Контекст
Таблица `student_groups` уже существует (поля: `id`, `name`, `color`, `organization_id`). Группы используются в StudentsTab для фильтрации. У профилей есть `student_group_id`. Но:
- Нет дат (start_date / end_date) у групп
- Нет вкладки «Группы» в CourseDetailsModal
- Нет возможности зачислить группу целиком на курс

### Изменения

#### 1. Миграция БД — добавить даты в `student_groups`
```sql
ALTER TABLE public.student_groups
  ADD COLUMN start_date date,
  ADD COLUMN end_date date;
```

#### 2. Новая вкладка «Группы» в CourseDetailsModal

| Файл | Изменение |
|------|-----------|
| `src/hooks/useCourseDetailsModal.ts` | Добавить `"groups"` в тип `CourseDetailsTabType` |
| `src/components/organization/dialogs/CourseDetailsModal.tsx` | Добавить таб `groups` в `TabsList`, создать `TabsContent` с компонентом `CourseGroupsTab` |
| **Новый:** `src/components/organization/CourseGroupsTab.tsx` | Компонент вкладки «Группы» |

#### 3. Компонент `CourseGroupsTab`
Функциональность:
- Список групп организации с датами (start_date — end_date)
- Кнопка «Зачислить группу» — выбрать группу → зачислить всех студентов группы на текущий курс
- Отображение уже зачисленных групп (по пересечению студентов группы с enrollments курса)
- Возможность редактировать даты группы (inline или в диалоге)

#### 4. Обновить StudentsTab — редактирование дат групп
В существующем диалоге создания группы (`showGroupDialog`) добавить поля `start_date` и `end_date`.

### Логика зачисления группы на курс
1. Получить всех `profiles` с `student_group_id = выбранная_группа`
2. Upsert в `enrollments` (user_id, course_id) для каждого студента
3. Показать toast с количеством зачисленных

