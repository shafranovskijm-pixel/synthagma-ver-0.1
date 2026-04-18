

## Цель

1. **Единый интерфейс организации**: настройки визуальной темы и тёмного/светлого режима хранятся в БД (`organizations.branding`), а не в localStorage. Один раз выбрала организация — при заходе с любого компьютера/любого сотрудника тема применяется автоматически.
2. **Смена логина (email) и пароля организации в Профиле**: добавить блок «Учётные данные для входа» в `ProfileTab` организации, чтобы менять email и пароль входа в саму ЛК организации (это креды строки `organization_credentials`, не персональный профиль сотрудника).

## Что меняем

### A. Глобальная тема организации (БД-источник правды)

**Где хранить:** `organizations.branding.orgTheme: { themeId: string|null, themeMode: 'light'|'dark'|'system', animLevel: 'off'|'low'|'medium'|'high' }`. Уже есть колонка `branding jsonb` — миграция не нужна.

**Новый файл `src/hooks/useOrgTheme.ts`** — единый загрузчик:
- по `organizationId` (или `current_organization_id` для членов) тянет `branding.orgTheme`,
- кэширует в `sessionStorage` (быстрый старт), но всегда перезаписывает после ответа БД,
- экспортирует `applyOrgTheme()` — записывает значения в `localStorage` (`visual-theme`, `theme`, `visual-animation-level`) **и** диспатчит `visual-theme-change` / `visual-animation-change` / `theme` (для совместимости со всеми существующими слушателями: `OrganizationDashboard`, `OrgSidebar`, `HeroBannerSwiper`, `ThemePersonalization`).

**Где вызывать `applyOrgTheme`:**
- `OrganizationDashboard` — в эффекте после монтирования (если orgId доступен) синхронно подтягиваем тему перед рендером сайдбара/баннера.
- `OrgPageLayout` (используется на /organization/profile, /organization/settings и т.д.) — то же самое.

**Где сохранять:** `ProfileTab` (новый подраздел «Внешний вид») и в `OrgSettingsContent` оставляем удобный доступ. Сохраняется через `update organizations.branding`.

**Поведение `ThemePersonalization` для роли organization:**
- В `ProfileTab` рядом с `ThemePersonalization` показываем `<ThemeSelector value=... onChange=...>` в **controlled-режиме** (уже поддерживается), значения берутся из `useOrgTheme`.
- При сохранении вызываем `update organizations.branding`, затем `applyOrgTheme(...)` — тема мгновенно применяется на текущей вкладке и подтянется на других устройствах при следующей загрузке.
- Тёмный/светлый режим тоже сохраняем в `orgTheme.themeMode` и применяем единообразно.
- На студенческой части ничего не ломаем — там действует `studentTheme` из `student_dashboard_settings` (уже реализовано).

### B. Смена логина и пароля организации в Профиле

Добавляем в `src/components/organization/tabs/ProfileTab.tsx` новую вкладку «Вход» (рядом с «Мой профиль»):

- Поле «Email для входа» (текущее значение из `organization_credentials.login_email` через `get_decrypted_org_credentials`).
- Кнопка «Изменить email» → новая edge-функция `update-org-email` (по аналогии с `reset-org-password`):
  - проверяет, что caller — организация, владеющая `organization_id`, либо admin;
  - меняет email в `auth.users` через service role (`updateUserById`);
  - обновляет `organization_credentials.login_email`;
  - возвращает success.
- Поля «Новый пароль» / «Подтвердите пароль» → вызывает существующую `reset-org-password`. **Доработка функции:** сейчас она требует `role = 'admin'`. Нужно разрешить также организации менять собственный пароль: добавить ветку `if role === 'organization' && current_organization_id() === organization_id`. Тогда на фронте просто передаём `organization_id = current org`.

UI: компактные карточки в стиле существующего блока «Сменить пароль», + предупреждение «После смены потребуется заново войти в систему» и автоматический `supabase.auth.signOut()` после смены email/пароля.

## Файлы

- **Новый**: `src/hooks/useOrgTheme.ts` — загрузка/сохранение/применение темы организации.
- **Edit**: `src/components/organization/tabs/ProfileTab.tsx` — новая вкладка «Вход» (email + пароль), новая секция «Внешний вид» (через ThemeSelector controlled + переключатель light/dark, общий для организации).
- **Edit**: `src/pages/OrganizationDashboard.tsx`, `src/components/organization/OrgPageLayout.tsx` — на старте применяют `applyOrgTheme` из БД.
- **Edit**: `supabase/functions/reset-org-password/index.ts` — разрешить смену пароля своей организацией (не только admin).
- **Новый edge**: `supabase/functions/update-org-email/index.ts` — смена email входа.

## Этапы

1. Создать хук `useOrgTheme` (read/write `organizations.branding.orgTheme`, apply через events).
2. Подключить `applyOrgTheme` на старте `OrganizationDashboard` и `OrgPageLayout` (приоритет БД над localStorage).
3. В `ProfileTab` организации:
   - заменить текущий блок «Тема оформления» на единую секцию (ThemePersonalization + ThemeSelector в controlled-режиме, сохранение в БД через хук);
   - добавить вкладку «Вход» с формами смены email и пароля.
4. Расширить `reset-org-password`: caller-организация может менять свой пароль.
5. Создать edge-функцию `update-org-email` (auth check → admin updateUserById → upsert organization_credentials).
6. Проверка end-to-end:
   - Организация выбирает тему «Лаванда» → сохраняет → на втором браузере (и у второго сотрудника той же организации) после входа сразу та же тема.
   - В Профиле меняется email — приходит письмо подтверждения, после подтверждения вход по новому email.
   - В Профиле меняется пароль — пользователь автоматически выходит и входит уже по новому.

