# Ссылка для входа ученика

В карточке ученика добавляем 2 типа ссылок и кнопку отправки на email.

## Что получит пользователь

В карточке ученика (`ProfileTab.tsx`, рядом с блоком «Учётные данные для входа») появятся 3 новые кнопки:

1. **«Ссылка автовхода»** — копирует ссылку вида `https://sintagma.com.ru/auto-login?token=XXXX`. Ученик переходит — сразу попадает в `/student` без ввода логина/пароля.
2. **«Ссылка с логином/паролем»** — копирует ссылку вида `https://sintagma.com.ru/login?u=student_29733&p=...`. Открывает форму входа с уже подставленными значениями, ученик жмёт «Войти».
3. **«Отправить ссылку на email»** — отправляет ученику письмо с обеими ссылками через SMTP организации (если у ученика заполнен email).

Срок действия — **бессрочный до отзыва**. В карточке появляется кнопка **«Отозвать ссылку автовхода»** (генерирует новый токен, старый перестаёт работать).

## База данных

Новая таблица `student_login_tokens`:
- `user_id` (FK на профиль)
- `organization_id`
- `token` (uuid, unique, индекс)
- `created_by` (uuid админа/орга)
- `revoked_at` (nullable)

RLS: ученики ничего не видят; org-staff с правом `students.manage` могут читать/создавать/обновлять токены своей организации; глобальные админы — всё.

RPC `consume_student_login_token(token)` (SECURITY DEFINER):
- проверяет, что токен валиден и не отозван;
- возвращает `email` + одноразовый магик-пароль через `supabase.auth.admin.generateLink('magiclink')` — нет, проще: возвращает `{ user_id, organization_id }`, после чего edge-функция выдаёт временную сессию.

Реально надёжный путь — **edge-функция** (см. ниже), а не RPC.

## Edge-функции

### `student-auto-login` (verify_jwt=false)
- Принимает `{ token }`.
- Проверяет токен в `student_login_tokens` (не revoked).
- Через `supabase.auth.admin.generateLink({ type: 'magiclink', email })` создаёт одноразовую ссылку и парсит `hashed_token` → возвращает фронту `{ access_token, refresh_token }` (через `verifyOtp` на сервере с service-role и эмуляцией сессии — **используем `signInWithOtp` + `verifyOtp` flow**).
- Логирует факт входа в `role_audit_log`.

Альтернатива проще: возвращаем готовый magic-link от Supabase (`action_link`), фронт делает `window.location = action_link` — Supabase сам выставит сессию и редиректнёт на `/student`. Этот вариант и берём.

### `send-student-login-link` (verify_jwt=true)
- Принимает `{ user_id }`. Проверяет, что вызывающий — staff организации ученика.
- Берёт/создаёт токен, формирует обе ссылки, шлёт письмо через SMTP организации (паттерн уже есть в `useStudentActions.sendCredentialsEmail`).

## Фронтенд

### Новая страница `/auto-login`
`src/pages/AutoLogin.tsx`:
- читает `?token=…`, вызывает `student-auto-login`;
- получает `action_link` → `window.location.replace(action_link)`;
- при ошибке — редирект на `/auth?error=link_expired`.
Регистрируем в `publicRoutes.tsx`.

### Доработка `/auth` (логин-формы)
Читаем `?u=` и `?p=` из URL, подставляем в поля. После успешного входа чистим URL (`history.replaceState`). По безопасности: показываем предупреждение «Логин/пароль переданы в ссылке».

### `useStudentActions.ts` + `useStudentDetailsDialog.ts`
Добавляем:
- `getOrCreateAutoLoginToken(student)` → возвращает URL автовхода;
- `copyAutoLoginLink(student)` / `copyCredentialsLink(student)` — `navigator.clipboard.writeText` + toast;
- `sendLoginLinksEmail(student)` — invoke `send-student-login-link`;
- `revokeAutoLoginToken(student)`.

### `ProfileTab.tsx` (org/student-detail)
В блоке «Учётные данные для входа» под существующими кнопками копирования/email добавляем строку из 3 кнопок: «Скопировать ссылку автовхода», «Скопировать ссылку с логином/паролем», «Отправить ссылки на email», + иконку «Отозвать» если токен есть.

Аналогично в `LSProfileTab.tsx` (охрана труда — изолированный кабинет, использует свою таблицу `labor_safety_profiles`; делаем такой же токен, но в `labor_safety_login_tokens`, либо переиспользуем общую таблицу — **выбираем общую таблицу** с nullable `ls_profile_id` для разделения).

## Безопасность

- Бессрочные токены = риск. Поэтому:
  - токен — UUIDv4 (128 бит энтропии);
  - храним в `student_login_tokens` и используем только для редиректа в magic-link от Supabase (Supabase валидирует свою короткоживущую часть);
  - кнопка «Отозвать» рядом + журнал `role_audit_log` фиксирует каждое использование;
  - права на создание/просмотр — только staff организации с `students.manage`.
- Ссылка с логином/паролем — менее безопасна, передаётся через URL. Помечаем в UI «Используйте только при личной передаче ученику».

## Файлы

**Создать:**
- `supabase/migrations/*_student_login_tokens.sql`
- `supabase/functions/student-auto-login/index.ts`
- `supabase/functions/send-student-login-link/index.ts`
- `src/pages/AutoLogin.tsx`

**Изменить:**
- `src/routes/publicRoutes.tsx` — маршрут `/auto-login`
- `src/pages/Auth.tsx` (или соответствующая логин-форма) — подхватывать `?u=&p=`
- `src/hooks/useStudentActions.ts` — 4 новых метода
- `src/hooks/useStudentDetailsDialog.ts` — пробросить методы
- `src/components/organization/student-detail/ProfileTab.tsx` — UI с кнопками
- `src/components/organization/labor-safety/LSProfileTab.tsx` — то же для ОТ
- `src/integrations/supabase/types.ts` — авто-обновится после миграции
