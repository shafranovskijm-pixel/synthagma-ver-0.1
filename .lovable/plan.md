## Что добавим в админский раздел «Менеджеры» (`/admin → Продажи → Менеджеры`)

### 1. Кнопка «Войти как менеджер» (как у организаций)

В карточке каждого менеджера в `SalesManagersList.tsx` добавим кнопку **«Войти как»** (иконка `Eye`). Поведение — точно по аналогии с `orgViewAsCompany` / `adminViewAsStudent`:

- сохраняем в `localStorage` ключ `adminViewAsSalesManager = { managerId, userId, fullName, returnTo: '/admin' }`;
- редиректим на `/sales` (страница `SalesDashboard`);
- в `SalesDashboard` показываем верхнюю плашку «Вы вошли как Менеджер ФИО · Вернуться в админку», по аналогии с существующими режимами;
- кнопка «Вернуться» очищает ключ и ведёт обратно на `/admin`.

Так как реальный сеанс подменять не нужно (и нельзя — это будет небезопасно), «вход» делаем как «view-as»: SalesDashboard будет фильтровать данные по выбранному `managerId`, а не по `auth.uid()`, когда активен режим админа. Под капотом — новый хелпер `getActiveSalesManagerId()` в `src/utils/adminViewMode.ts`, который читает `localStorage` (для admin) и фолбэк на текущего пользователя.

Хуки, которые надо подружить с этим режимом (минимально):
- `useSalesManager` (`leads`, `proposals`, `tasks`): если активен view-as и роль = admin → фильтровать запросы по выбранному `manager_id`.
- На страницы, где это критично (Обзор, Задачи, Сделки), пробросим `viewAsManagerId` через контекст или проп.

### 2. Тестовая учётка `sales.test@sintagma.com.ru` в списке

Сейчас она уже создана в `auth.users` и в `user_roles` как `sales_manager`, но запись в `sales_managers` могла не появиться, поэтому в списке её не видно. Поправим двумя шагами:
- одноразовый INSERT в `sales_managers` для этого user_id (если ещё нет);
- в SQL функции `ensure_sales_manager_for_current_user` уже есть автосоздание — оставляем, чтобы любые новые менеджеры появлялись сами.

После этого `sales.test` появится в списке и по нему сразу будет работать «Войти как».

### 3. Приглашение менеджера по ссылке (Telegram / WhatsApp / Email / Копировать)

Используем уже существующую систему `staff_invitations` + edge `send-staff-invitation` / `accept-staff-invitation` (см. memory «Staff Invitations & Audit»). Добавляем для роли `sales_manager` отдельный сценарий:

- в `SalesManagersList` рядом с «Добавить менеджера» — новая кнопка **«Пригласить по ссылке»**.
- Диалог `InviteSalesManagerDialog`:
  - поля: ФИО (опционально), email (опционально — для отправки письма), срок действия (по умолчанию 7 дней), лимит активаций (1);
  - кнопка «Создать ссылку» → вызов RPC/edge, который создаёт запись в `staff_invitations` с `target_role='sales_manager'` и `scope='global'`;
  - после создания показываем ссылку вида `https://sintagma.com.ru/accept-invitation?token=...`;
  - блок «Поделиться»: кнопки **Telegram** (`https://t.me/share/url?url=...&text=...`), **WhatsApp** (`https://wa.me/?text=...`), **Email** (`mailto:?subject=...&body=...`), **Скопировать ссылку** (toast).
  - опционально: чекбокс «Отправить на email сразу» → вызов `send-staff-invitation` (уже умеет SMTP).

- Страница `/accept-invitation` (уже есть) научим обрабатывать `target_role='sales_manager'`:
  - если пользователь не авторизован → форма регистрации (email + пароль + ФИО + телефон);
  - после регистрации edge `accept-staff-invitation` выставляет `user_roles.role='sales_manager'` и создаёт запись в `sales_managers`;
  - редирект на `/sales`.

### 4. Технические детали (для разработчика)

Файлы:
- `src/utils/adminViewMode.ts` — добавить `setAdminViewAsSalesManager / clearAdminViewAsSalesManager / getActiveSalesManagerView`.
- `src/pages/SalesDashboard.tsx` — баннер «view as», очистка ключа, передача `viewAsManagerId` в `SalesManager`.
- `src/components/admin/SalesManager.tsx` — приём `viewAsManagerId` и проброс в дочерние компоненты.
- `src/hooks/useSalesManager.ts` — при наличии `viewAsManagerId` использовать его вместо текущего менеджера.
- `src/components/admin/sales/SalesManagersList.tsx`:
  - кнопка «Войти как» (Eye) в строке;
  - кнопка «Пригласить по ссылке» в шапке;
  - новый компонент `InviteSalesManagerDialog.tsx`.
- `src/pages/AcceptInvitation.tsx` — ветка для `sales_manager` (форма регистрации + редирект на `/sales`).
- Edge `accept-staff-invitation` — обработка `target_role='sales_manager'`: создать профиль, выставить роль, INSERT в `sales_managers`.
- Одноразовый SQL: вставить запись в `sales_managers` для `sales.test`, если её нет.

Безопасность:
- Создание ссылок-приглашений — только для admin (RLS на `staff_invitations` уже есть).
- «Войти как менеджер» — флаг чисто клиентский для UI; все запросы данных всё равно идут под админом (RLS у админа уже даёт полный доступ), мы лишь фильтруем выдачу по `manager_id`. Никакой реальной подмены сессии.

### Что НЕ делаем

- Не трогаем CRM-функционал по сути (КП, договоры, задачи остаются как есть).
- Не подключаем телефонию (Exolve — отдельным этапом, как договаривались).
- Не вводим новые роли/таблицы.

После реализации в админке: в списке менеджеров появится `sales.test`, рядом с каждым — «Войти как» (открывает `/sales` глазами менеджера с баннером возврата), и кнопка «Пригласить по ссылке» с шарингом в Telegram/WhatsApp/Email/копирование.
