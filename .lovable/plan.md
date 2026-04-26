## Цель

1. **CRM-задачи** можно назначать любому сотруднику организации, у кого включён флаг «Может получать задачи CRM», а не только пользователям с ролью `sales_manager`.
2. **Регистрация сотрудников** становится понятнее: добавляем кнопку мгновенного создания сотрудника с логином/паролем (как при создании ученика) + подсвечиваем приглашение по email.

---

## 1. База данных

### 1.1. Расширение `org_staff`
Добавляем флаг получения задач CRM:
```sql
ALTER TABLE public.org_staff
  ADD COLUMN can_receive_crm_tasks boolean NOT NULL DEFAULT false;

-- Включаем флаг автоматически для уже существующих менеджеров продаж и владельцев
UPDATE public.org_staff
   SET can_receive_crm_tasks = true
 WHERE role IN ('sales_manager', 'owner', 'admin');

CREATE INDEX idx_org_staff_can_receive_crm
  ON public.org_staff(organization_id)
  WHERE can_receive_crm_tasks = true;
```

### 1.2. Новое поле в `sales_tasks`
```sql
ALTER TABLE public.sales_tasks
  ADD COLUMN assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_sales_tasks_assigned_user
  ON public.sales_tasks(assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;
```
- `manager_id` оставляем для обратной совместимости (КП/договоры/лиды по-прежнему ссылаются на `sales_managers`).
- В новой логике приоритет: `assigned_user_id` (новое поле) > `manager_id` (фолбек).
- RLS не меняем — текущие политики уже фильтруют по `organization_id` и `current_organization_id()`.

### 1.3. RPC для списка возможных исполнителей задач
Создаём `SECURITY DEFINER` функцию, которая возвращает «кому можно назначить задачу» в текущей организации:
```sql
CREATE OR REPLACE FUNCTION public.list_org_task_assignees(_org_id uuid)
RETURNS TABLE(user_id uuid, full_name text, role text, email text)
...
```
Возвращает: владельца организации (из `profiles.organization_id`) + всех `org_staff` с `can_receive_crm_tasks = true`.

---

## 2. Backend / Edge function

### 2.1. Новая edge-функция `create-org-staff`
Аналог `create-org-user`, но создаёт сотрудника организации:
- Принимает: `email`, `password`, `fullName`, `organizationId`, `role`, `displayName`, `visibility`, `canReceiveCrmTasks`.
- Проверяет, что вызывающий — владелец/админ этой организации (через `has_org_staff_permission` или `userRole === 'organization'`).
- Создаёт пользователя через `supabase.auth.admin.createUser` с `email_confirm: true`.
- Создаёт `profiles` (с `organization_id`).
- Назначает глобальную роль (новую — `org_staff`) или используем существующую логику.
- Создаёт запись в `org_staff` с указанной ролью и флагом.
- Триггер `sync_admin_staff_to_sales_managers` уже есть для admin_staff — добавим аналогичный для `org_staff` (см. ниже).

### 2.2. Новый триггер `sync_org_staff_to_sales_managers`
Чтобы существующие места (КП/договоры/лиды), завязанные на `sales_managers`, продолжали работать для сотрудников с ролью `sales_manager` или с `can_receive_crm_tasks = true`:
```sql
CREATE OR REPLACE FUNCTION public.sync_org_staff_to_sales_managers()
RETURNS trigger ...
-- На INSERT/UPDATE: если can_receive_crm_tasks = true OR role = 'sales_manager' → upsert в sales_managers
-- На UPDATE/DELETE: деактивировать sales_managers если флаг снят и роль ≠ sales_manager
```
Это гарантирует: галочка «Может получать задачи CRM» автоматически даёт сотруднику запись в `sales_managers`, и его можно ставить как менеджера в КП/договоре/лиде.

---

## 3. Frontend

### 3.1. `src/components/organization/StaffManager.tsx`
- В таблице сотрудников новая колонка **«Задачи CRM»** с переключателем (Switch). Сохраняет в `org_staff.can_receive_crm_tasks` через UPDATE.
- В диалоге добавления существующего пользователя — чекбокс «Может получать задачи CRM».
- Новая третья кнопка **«Создать сотрудника»** (рядом с «Пригласить» и «Добавить»):
  - Открывает диалог с полями: email, ФИО, временный пароль (с генератором), роль, видимость, чекбокс CRM-задач.
  - Вызывает edge `create-org-staff`.
  - После успеха — копирует логин/пароль в буфер обмена (как сейчас при создании учеников) и показывает их в toast.
- Подсветка рекомендации: над кнопками — небольшой блок «💡 Лучший способ — пригласить по email: сотрудник сам задаст пароль». Кнопка «Пригласить» становится `btn-gradient` (главной).

### 3.2. `src/hooks/useSalesTasks.ts`
- В `SalesTask` интерфейс добавить `assigned_user_id: string | null`.
- В фильтре поддержать `assignedUserId?: string` (для будущих экранов «Мои задачи»).
- В `create` передавать `assigned_user_id`.

### 3.3. Новый хук `useOrgTaskAssignees.ts`
```ts
export function useOrgTaskAssignees(organizationId?: string) {
  return useQuery({
    queryKey: ['org_task_assignees', organizationId],
    queryFn: async () => supabase.rpc('list_org_task_assignees', { _org_id: organizationId }),
    enabled: !!organizationId,
  });
}
```

### 3.4. `src/components/admin/sales/SalesTasks.tsx` (форма `NewTaskForm`)
- Меняем дропдаун **«Менеджер»** → **«Исполнитель»**.
- Источник списка — `useOrgTaskAssignees` (все сотрудники с галочкой), а не `useSalesManager`.
- При создании задачи передаём `assigned_user_id` вместо/вместе с `manager_id`.
  - Если выбранный исполнитель есть в `sales_managers` (через триггер 3.2), автоматически проставляем `manager_id` тоже — для совместимости со старыми отчётами.
- В отображении задачи показываем имя исполнителя (резолвим из списка assignees).
- Если в дропдауне пусто — подсказка: «Нет сотрудников с правом получать задачи. Включите флаг в [Настройки → Сотрудники]».

### 3.5. `src/components/admin/sales/LogActivityDialog.tsx`
- Аналогично: вместо привязки к `sales_managers.id` для текущего пользователя сначала ищем по `assigned_user_id`, фолбек на `manager_id`.
- При создании follow-up задачи передаём `assigned_user_id = текущий пользователь`.

### 3.6. Карточка сотрудника / OrgPermissionMatrix
Никаких структурных изменений матрицы прав не требуется — `can_receive_crm_tasks` это **операционный флаг**, а не роль. Управляется отдельным переключателем в таблице сотрудников.

---

## 4. Совместимость со старыми задачами

- Старые `sales_tasks` с `manager_id` и `assigned_user_id IS NULL` продолжают отображаться: при рендере резолвим имя через `sales_managers` (как сейчас).
- Новые задачи всегда пишут `assigned_user_id`. Для дизайна экрана это поле приоритетнее.

---

## 5. Память / документация

После выполнения:
- Обновить `mem://features/staff-management` — упомянуть флаг `can_receive_crm_tasks` и кнопку «Создать сотрудника».
- Создать `mem://features/sales/task-assignment` — описать модель: `assigned_user_id` приоритет, `manager_id` legacy, триггер sync.
- Обновить index.

---

## Что НЕ меняем

- КП (`commercial_proposals`), договоры (`sales_contracts`), лиды (`sales_leads`) по-прежнему ссылаются на `sales_managers.id` — это нормально, т.к. триггер 3.2 поднимает запись в `sales_managers` для всех сотрудников с галочкой.
- RLS-политики `sales_tasks` — без изменений (фильтр по `organization_id` уже корректен).
- `admin_staff` и существующий триггер `sync_admin_staff_to_sales_managers` — без изменений.