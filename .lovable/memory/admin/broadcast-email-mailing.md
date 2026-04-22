---
name: Broadcast email mailing
description: Система рассылок: SMTP, шаблоны, продающие письма, прогрев, suppression-лист, планировщик, click-tracking, UTM, dedup, RFC 8058 unsubscribe
type: feature
---

Система рассылок в админ-панели (вкладка «Рассылка»). Платформенный SMTP (через ENV) или SMTP организации (расшифровка через `get_decrypted_org_smtp`). Edge: `run-email-campaign`, `send-campaign-email`, `process-paused-campaigns`, `process-scheduled-campaigns`, `email-unsubscribe`, `email-click-redirect`, `track-email-open`.

## Заполнение получателей

Получатели вставляются `run-email-campaign` при первом запуске кампании (если в `email_campaign_recipients` ещё пусто). Источники (`recipient_source`): `manual`, `organizations`, `companies_db` (sales_companies_db), `students` (profiles по org), `companies` (по org). Дедупликация по email + фильтр через `email_suppressions` (для платформы — только `scope=platform`; для орг — `scope IN (orgId, 'platform')`).

## Шаблоны (src/components/admin/broadcast/emailTemplates.ts)

7 шаблонов в Teal/Cyan (#1AAB9B): `inactive`, `welcome`, `cold`, `presentation` (большой продающий с 4 блоками), `followup`, `proposal`, `reactivation`. Все продающие — с футером «СТОП для отписки» + ссылкой `{{unsubscribe_url}}`. В `email_templates` синхронизированы как `scope='platform' is_default=true`.

## Планировщик отправки

В `CampaignEditor` чекбокс «Запланировать отправку» + дата/время → `email_campaigns.scheduled_at` + `status='scheduled'`. Cron `process-scheduled-campaigns` (jobid 11, schedule `* * * * *`) проверяет `scheduled_at <= now()` и переводит в `draft` + вызывает `run-email-campaign`. Минимум +30 сек в будущее.

## Автосохранение черновика

`CampaignEditor` сохраняет в `localStorage('broadcast_campaign_draft_v1')` каждые 800 мс (debounce). Восстанавливается при открытии диалога (если scope/org совпадают и черновик не старше 7 дней). При успешном создании — очищается.

## Suppression-лист (email_suppressions)

Таблица `email_suppressions(email, scope, reason, source_campaign_id, ...)`. Reason: `manual|unsubscribe|bounce|complaint`. UI: вкладка «Отписавшиеся» (`SuppressionListManager`) — добавление вручную, поиск, удаление. RPC `is_email_suppressed(email, scope)` используется в `send-campaign-email`.

## RFC 8058 One-Click Unsubscribe

`send-campaign-email` добавляет заголовки `List-Unsubscribe: <url>, <mailto:...>`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, `Precedence: bulk`. Edge `email-unsubscribe` обрабатывает GET (страница) и POST (one-click) → пишет в `email_suppressions`, инкрементит `unsubscribe_count`.

## Click-tracking + UTM

`_shared/email-html-utils.ts` (`processCampaignHtml`) при отправке: оборачивает все `<a href>` через `email-click-redirect?t=<token>&url=<encoded>` для подсчёта кликов в `email_campaign_clicks`, и при `utm_enabled !== false` добавляет UTM (`utm_source=sintagma_email`, `utm_medium=email`, `utm_campaign=<campaign_name_slug>`). Клик считается также как открытие, если `opened_at` пуст.

## Валидация HTML

В `handleSave` сравниваются открытые/закрытые теги (`p|div|a|span|table|tr|td`); при разнице >2 — confirm.

## CreateWebinarQuick fallback

Для платформенного админа без `profiles.organization_id` — `Select` со списком организаций. Выбор в `localStorage('broadcast_webinar_org_id')`.

## Колонки email_campaigns

`scheduled_at`, `started_at`, `completed_at`, `total_recipients`, `sent_count`, `failed_count`, `open_count`, `click_count`, `unsubscribe_count`, `utm_enabled` (default true), `user_paused`, `template_id`. Статусы: `draft|scheduled|sending|completed|failed|paused`.

## Что ещё можно улучшить (опционально)

A/B-тест темы, расширенные персональные переменные (`{{org_name}}`, `{{plan}}`), inbox-превью (Litmus/email-on-acid), drip-кампании (последовательности писем по триггерам), DMARC/DKIM-мониторинг.
