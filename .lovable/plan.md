# Защита от потерянных регистраций

## Проблема
Сейчас Telegram-уведомление приходит только при **успешной** регистрации. Если падает edge-функция, signup в Supabase или клиент закрывает вкладку — лид теряется бесследно. С платной рекламы это критично.

## Решение — 4 уровня защиты

### 1. Таблица `registration_attempts`
Новая таблица фиксирует каждую попытку:
- `step`: `submitted` / `success` / `failed`
- Контакты: `email`, `phone`, `org_name`, `contact_name`, `inn`
- Маркетинг: `utm_source/medium/campaign/term/content`, `ref_code`, `page_url`, `referrer`
- Технические: `user_agent`, `ip`, `error_message`, `created_at`
- Индексы по `created_at`, `step`, `email`, `(ip, created_at)`
- RLS: SELECT/UPDATE — только админам. INSERT — через edge с service-role.

### 2. Edge `log-registration-attempt` (verify_jwt = false)
- Принимает `attempt_id` (опционально) + поля → upsert в `registration_attempts`.
- Rate-limit: ≤5 попыток с одного IP за 10 минут.
- При `step='failed'` — шлёт в Telegram алерт: «⚠️ FAILED регистрация: <email>, <тел>, <ИНН>, ошибка: ...» с tel:/mailto: ссылками для быстрого звонка.
- Дедуп Telegram при повторных F5 (один email — одно уведомление в час).

### 3. Доработка `useRegisterOrganization.ts`
- При монтировании — захват `utm_*` из URL в localStorage (по аналогии с `captureRefFromUrl`).
- В `handleSubmit`:
  - **до** вызова `register-organization` → лог `step='submitted'` (получаем `attempt_id`)
  - на успехе → `step='success'` с `user_id` и `organization_id`
  - в `catch` → `step='failed'` с `error_message` (Telegram алерт уйдёт автоматически из edge)
- Резерв через `navigator.sendBeacon` — если вкладка закроется во время сабмита, попытка всё равно долетит.

### 4. Админ-страница `/admin/registration-leads`
- Таблица: дата • статус (badge зелёный/красный/жёлтый) • организация • контакт • email • телефон • ИНН • тариф • UTM-источник • ошибка
- Фильтры: статус (все / failed / success / submitted), период (24ч/7д/30д/custom), UTM-источник
- Поиск по email/телефону/ИНН
- Кнопки в строке: «Позвонить» (tel:), «Написать» (mailto:), «Скопировать контакты»
- Стат-карточки сверху: всего попыток, успехов, провалов, конверсия %
- Пункт в админ-сайдбаре «Лиды регистрации»

## Что получит клиент
1. **Ноль потерянных лидов** — даже при технических сбоях контакт сохранён + менеджер сразу получает алерт в Telegram.
2. **UTM-аналитика** — видно, какие рекламные кампании реально приводят регистрации.
3. **Скорость реакции** — алерт приходит мгновенно, можно перезвонить лиду за 5 минут.
4. **Диагностика проблем** — массовые `failed` сразу видны в админке (например, упал edge или DaData).

## Технические детали
- Миграция: `registration_attempts` + RLS + индексы + триггер `updated_at`.
- Edge `log-registration-attempt`: zod-валидация, in-memory rate-limit по IP, Telegram через существующий `send-telegram-notification`.
- `src/utils/utmCapture.ts` — новый утилитарный модуль (по образцу `referralCookie.ts`), вызывается в `App.tsx`.
- `src/pages/admin/RegistrationLeads.tsx` — новая страница + маршрут в `adminRoutes.tsx` + ссылка в админ-сайдбаре.
- Никаких изменений в существующей логике успешной регистрации — только добавляется логирование вокруг.
