

# Заявка на запись вместо прямой записи

## Суть
Добавить настройку курса «Запись по заявке» — студент нажимает «Записаться», но вместо прямого зачисления отправляется уведомление в учебный центр. Студент видит статус «Заявка отправлена».

## Что будет сделано

### 1. Миграция: колонка `require_enrollment_approval` в `courses`
```sql
ALTER TABLE public.courses 
  ADD COLUMN require_enrollment_approval boolean NOT NULL DEFAULT false;
```

### 2. Таблица `enrollment_requests` — заявки на запись
```sql
CREATE TABLE public.enrollment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  UNIQUE(course_id, user_id)
);
ALTER TABLE public.enrollment_requests ENABLE ROW LEVEL SECURITY;
```
RLS: студент видит свои заявки, организация — заявки по своим курсам.

### 3. Логика записи (`CourseLanding.tsx`)
- Если `require_enrollment_approval = true` и цена = 0:
  - Вместо `INSERT INTO enrollments` → `INSERT INTO enrollment_requests`
  - Вставка уведомления в `org_notifications` (тип `enrollment_request`)
  - Toast: «Заявка отправлена! Учебный центр рассмотрит вашу заявку»

### 4. Карточка курса (`CourseCardNew.tsx`)
- Новый статус `pending` — если есть заявка со статусом `pending`
- Показывать «Заявка отправлена» вместо «Записаться»

### 5. Каталог студента (`useStudentDashboard.ts`)
- Подгружать `enrollment_requests` для текущего пользователя
- Передавать статус `pending` в карточки

### 6. Управление заявками в панели организации (`CourseDetailsContent.tsx`)
- Новая вкладка или секция «Заявки на запись»
- Список заявок с кнопками «Одобрить» / «Отклонить»
- Одобрение = создание записи в `enrollments` + обновление статуса заявки

### 7. Настройка в `CourseSettingsTabbed.tsx`
- Вкладка «Доступ» — переключатель «Запись по заявке»
- Описание: «Студенты отправляют заявку, а не записываются автоматически. Вы получите уведомление для подтверждения»

## Файлы

| Файл | Изменение |
|---|---|
| Миграция SQL | `require_enrollment_approval` + таблица `enrollment_requests` + RLS |
| `CourseSettingsTabbed.tsx` | Переключатель «Запись по заявке» |
| `CourseLanding.tsx` | Логика заявки вместо прямой записи |
| `CourseCardNew.tsx` | Статус `pending` |
| `useStudentDashboard.ts` | Загрузка заявок студента |
| `CourseDetailsContent.tsx` | Управление заявками (одобрить/отклонить) |

