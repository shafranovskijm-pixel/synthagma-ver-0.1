

# Перенос групп из редактора + связь заявок с группами

## Что сделать

### 1. Убрать «Ближайшие группы» из редактора курса
Удалить блок в `src/pages/CourseBuilder.tsx` (строки 217–226) — секцию с `CourseGroupsTab` внутри конструктора. Группы уже доступны на странице курса через боковое меню (вкладка «Группы»), дублирование не нужно.

### 2. Связать заявки с группами
На вкладке «Заявки» (`requests` в `CourseDetailsContent.tsx`) добавить возможность:
- При одобрении заявки предлагать выбрать группу для зачисления (dropdown с существующими группами курса)
- Кнопка «Зачислить в группу» — автоматически добавляет ученика в `student_groups` и делает enrollment
- После зачисления в группу — отправлять сообщение в чат ученику: «Вы зачислены в группу "X", старт: DD.MM.YYYY»

### 3. Уведомление в чат о группе
При зачислении через заявку — автоматическое сообщение в чат (таблица `messages`) с информацией о группе и дате старта.

## Файлы

| Файл | Изменение |
|------|-----------|
| `src/pages/CourseBuilder.tsx` | Удалить блок «Ближайшие группы» (строки 217–226), убрать неиспользуемый импорт `CourseGroupsTab` |
| `src/components/organization/CourseDetailsContent.tsx` | В секции обработки заявок добавить выбор группы при одобрении и автоотправку сообщения в чат |

## Технические детали

Блок удаления в CourseBuilder:
```
// Удалить строки 217-226:
{resolvedCourseId && organizationId && (
  <div className="mt-8 p-6 bg-card rounded-2xl border border-border shadow-sm">
    <div className="flex items-center gap-2 mb-4">
      <Users className="w-5 h-5 text-primary" />
      <h2 className="text-lg font-semibold">Ближайшие группы</h2>
    </div>
    <CourseGroupsTab courseId={resolvedCourseId} organizationId={organizationId} />
  </div>
)}
```

Для связи заявок с группами — при клике «Одобрить» показывать select с группами курса (запрос `student_groups` по `course_id`). При выборе группы:
1. `student_group_id` в `profiles` обновляется
2. Создаётся enrollment
3. В `messages` вставляется уведомление с текстом о группе и дате старта
