

# Регистрационная ссылка для группы

## Суть
При создании группы — добавить поля дат (начало/конец набора) и автоматически генерировать регистрационную ссылку, привязанную к группе. Ученики, регистрирующиеся по этой ссылке, автоматически попадают в группу.

## Что будет сделано

### 1. Миграция: добавить `student_group_id` в `registration_links`
```sql
ALTER TABLE registration_links 
  ADD COLUMN student_group_id uuid REFERENCES student_groups(id) ON DELETE SET NULL;
```

### 2. Обновить `CourseGroupsTab.tsx` — создание группы с датами и ссылкой
- В диалог создания группы добавить поля: **Дата начала**, **Дата окончания** (DatePicker)
- При создании группы автоматически создавать `registration_link` с `student_group_id`, `organization_id`, `course_id`, `expires_at = end_date`
- После создания — показывать ссылку с кнопкой «Скопировать»
- В списке групп — показывать кнопку копирования ссылки у каждой группы

### 3. Обновить `JoinByLink.tsx` — показывать название группы
- При валидации ссылки: если есть `student_group_id`, загрузить название группы и показать на странице регистрации

### 4. Обновить edge-функцию `register-student` — привязка к группе
- Принимать `student_group_id` в body
- При создании профиля — устанавливать `student_group_id` в profiles

### 5. Обновить `JoinByLink.tsx` — передавать `student_group_id`
- Передавать `student_group_id` из `linkData` в вызов `register-student`

## Файлы

| Файл | Изменение |
|---|---|
| Миграция | `ALTER TABLE registration_links ADD COLUMN student_group_id` |
| `src/components/organization/CourseGroupsTab.tsx` | Даты + авто-создание ссылки + копирование |
| `src/pages/JoinByLink.tsx` | Загрузка группы, передача `student_group_id` |
| `supabase/functions/register-student/index.ts` | Установка `student_group_id` в профиль |

