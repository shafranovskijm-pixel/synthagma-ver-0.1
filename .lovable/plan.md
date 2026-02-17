

# Журнал видеоидентификации + логирование заходов на курс + объединённая вкладка активности

## Что будет сделано

### 1. Новая таблица `course_access_log` (миграция)
Фиксация каждого захода студента на курс:
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `course_id` (uuid, NOT NULL)
- `organization_id` (uuid)
- `accessed_at` (timestamptz, default now())
- `ip_address` (text, nullable)
- `user_agent` (text, nullable)

RLS: чтение для `organization` (по `organization_id = current_organization_id()`) и `admin`.

### 2. Запись захода на курс
В хуке `useCourseLearning.ts`, при загрузке курса (после определения `courseId` и `user`), вставлять запись в `course_access_log` с `course_id`, `user_id` и `organization_id` (из enrollment).

### 3. Обновление вкладки "Активность" в карточке студента
Файл `ActivityTab.tsx` -- добавить две секции:
- **Заходы на курсы** -- загрузка из `course_access_log` по `user_id` и `organization_id`, отображение с названием курса, датой и устройством
- **Заходы на платформу** -- текущая логика (student_login_history)

### 4. Сводный журнал видеоидентификации
Новый компонент `src/components/organization/IdentificationJournal.tsx`:
- Таблица всех студентов организации с их статусом видеоидентификации
- Столбцы: Имя, Email, Статус, Фото, Дата, Действия (подтвердить/отклонить)
- Фильтры по статусу: все / ожидает / подтверждено / отклонено
- Данные из таблиц `video_identifications` + `profiles`

### 5. Интеграция журнала в панель управления
Добавить журнал видеоидентификации как подвкладку в `JournalsManager` или как отдельную секцию, доступную менеджеру организации.

## Технические детали

### Миграция SQL
```sql
CREATE TABLE public.course_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  accessed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);

ALTER TABLE public.course_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org managers can view course access logs"
  ON public.course_access_log FOR SELECT TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin', auth.uid()));

CREATE POLICY "Authenticated users can insert own access logs"
  ON public.course_access_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_course_access_log_user ON public.course_access_log(user_id);
CREATE INDEX idx_course_access_log_org ON public.course_access_log(organization_id);
```

### Файлы для изменения
1. **`src/hooks/useCourseLearning.ts`** -- добавить INSERT в `course_access_log` при загрузке курса
2. **`src/components/organization/student-detail/ActivityTab.tsx`** -- добавить секцию "Заходы на курсы" с данными из `course_access_log`
3. **Новый файл: `src/components/organization/IdentificationJournal.tsx`** -- сводная таблица видеоидентификаций по организации
4. **`src/components/organization/JournalsManager.tsx`** -- добавить вкладку "Видеоидентификация" с `IdentificationJournal`

