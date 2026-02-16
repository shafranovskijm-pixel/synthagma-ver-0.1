

# История заходов, онлайн-статус и чат с учеником

## Что будет сделано

### 1. Онлайн-статус учеников
- Зеленая/серая точка рядом с именем в списке учеников и в карточке студента
- Текст "онлайн" или "был(а) X назад" на основе существующего поля `profiles.last_visit_at`
- Порог онлайна: менее 5 минут с последнего визита

### 2. История входов на платформу
- Новая таблица `student_login_history` для хранения каждого входа (дата, IP, браузер)
- Запись входа при авторизации студента через `useAuth.tsx`
- Новая вкладка "Активность" в карточке студента с хронологическим списком входов

### 3. Чат организации с учеником
- Новая таблица `org_student_messages` с Realtime для мгновенной доставки
- Приватный бакет `chat-attachments` для скриншотов и файлов
- Новая вкладка "Чат" в карточке студента с полноценным интерфейсом переписки
- Возможность прикрепить скриншот/файл к сообщению
- Отображение картинок inline, остальных файлов как ссылки для скачивания

## Изменения в интерфейсе

### Список учеников (StudentsTab.tsx)
- Новая колонка "Онлайн" между "Ученик" и "Группа" -- зеленая/серая точка + текст последнего визита
- Кнопка "Чат" (иконка MessageCircle) в колонке "Действия"

### Карточка студента (StudentDetailCard.tsx)
- Онлайн-индикатор рядом с именем в заголовке
- Новая вкладка "Активность" (Clock) -- таблица с историей входов
- Новая вкладка "Чат" (MessageCircle) -- интерфейс переписки

## Технические детали

### Миграция базы данных

**Таблица `student_login_history`:**
- `id` (uuid), `user_id` (uuid), `organization_id` (uuid), `logged_in_at` (timestamptz), `ip_address` (text), `user_agent` (text)
- RLS: организация видит записи своих студентов, admin видит все

**Таблица `org_student_messages`:**
- `id` (uuid), `organization_id` (uuid), `student_user_id` (uuid), `sender_user_id` (uuid), `content` (text), `attachment_url` (text), `attachment_type` (text), `is_read` (boolean), `created_at` (timestamptz)
- RLS: организация видит сообщения своей org; студент видит свои
- Realtime включен

**Бакет `chat-attachments`:**
- Приватный бакет с RLS для authenticated пользователей

### Новые файлы
- `src/components/organization/student-detail/ActivityTab.tsx` -- вкладка истории входов
- `src/components/organization/student-detail/ChatTab.tsx` -- вкладка чата с загрузкой файлов

### Изменяемые файлы
- `src/hooks/useAuth.tsx` -- логирование входа в `student_login_history`
- `src/hooks/useStudentDetailCard.ts` -- загрузка `last_visit_at`, истории входов, сообщений
- `src/api/students.ts` -- добавить `last_visit_at` в выборку профилей
- `src/types/student.ts` -- добавить поле `last_visit_at` в тип `Student`
- `src/components/organization/StudentDetailCard.tsx` -- 2 новые вкладки + онлайн-индикатор в заголовке
- `src/components/organization/tabs/StudentsTab.tsx` -- колонка "Онлайн" + кнопка "Чат"

