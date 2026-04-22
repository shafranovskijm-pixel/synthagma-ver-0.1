---
name: Broadcast email mailing
description: Система рассылок: SMTP, шаблоны, продающие письма, прогрев, suppression-лист, планировщик, click-tracking, UTM, dedup, RFC 8058 unsubscribe, A/B-тест тем, расширенные переменные, импорт CSV/Excel, inbox-превью, проверка SPF/DKIM/DMARC, drip-цепочки
type: feature
---

Система рассылок в админ-панели (вкладка «Рассылка»). Платформенный SMTP (через ENV) или SMTP организации (расшифровка через `get_decrypted_org_smtp`). Edge: `run-email-campaign`, `send-campaign-email`, `process-paused-campaigns`, `process-scheduled-campaigns`, `email-unsubscribe`, `email-click-redirect`, `track-email-open`, `email-ab-pick-winner`, `email-domain-check`.

## Заполнение получателей

Получатели вставляются `run-email-campaign` при первом запуске кампании. Источники (`recipient_source`): `manual`, `organizations`, `companies_db`, `students`, `companies`. Дедупликация по email + фильтр через `email_suppressions`.

## Шаблоны

7 шаблонов в Teal/Cyan (#1AAB9B): `inactive`, `welcome`, `cold`, `presentation`, `followup`, `proposal`, `reactivation`. Все продающие — с футером «СТОП для отписки» + ссылкой `{{unsubscribe_url}}`.

## Планировщик отправки

Чекбокс «Запланировать отправку» + дата/время → `email_campaigns.scheduled_at` + `status='scheduled'`. Cron `process-scheduled-campaigns` (jobid 11, `* * * * *`). Минимум +30 сек в будущее.

## A/B-тест тем (jobid 12, `*/5 * * * *`)

Поля `email_campaigns.subject_b`, `ab_test_enabled`, `ab_sample_percent` (5–50, default 20), `ab_winner` (a/b), `ab_winner_picked_at`, `ab_sample_started_at`. У получателя — `subject_variant` (a/b/null). Поток: `run-email-campaign` размечает sample-получателей рандомно 50/50 → отправляет только их → cron `email-ab-pick-winner` через ≥30 минут считает open rate и выбирает победителя → размечает оставшиеся pending → перезапускает `run-email-campaign` для добивки.

## Расширенные переменные

В `send-campaign-email` подгружаются: `{{org_name}}`, `{{plan}}`, `{{course_count}}`, `{{last_login}}` (из `organizations` и `profiles` по email получателя). Плюс старые: `{{name}}`, `{{email}}`, `{{date}}`, `{{time}}`, `{{webinar_url}}`, `{{host_name}}`, `{{unsubscribe_url}}`.

## Импорт получателей из CSV/Excel

В `RecipientPicker` (источник «Ручной список email») — кнопка «Импорт из CSV/Excel». Использует `xlsx`-парсер: читает первый лист, ищет email-подобные строки в любой колонке, дедуплицирует и объединяет с уже введёнными.

## Inbox-превью

Компонент `InboxPreview` — третья вкладка в редакторе. Эмуляция Gmail/Mail.ru/Outlook + переключатель Desktop/Mobile (360/720px). Показывает list-row (аватар, отправитель, тема, preheader) и тело письма в iframe с sandbox.

## Репутация домена (SPF/DKIM/DMARC)

Edge `email-domain-check` через Google DNS-over-HTTPS (`https://dns.google/resolve`) проверяет TXT/MX-записи. Считает score 0–100 (SPF 35, DMARC 35, DKIM 25, MX 5), даёт рекомендации по настройке. UI — вкладка «Репутация домена» в `BroadcastManager`.

## Suppression-лист (email_suppressions)

Таблица + RPC `is_email_suppressed`. UI: вкладка «Отписавшиеся» (`SuppressionListManager`).

## RFC 8058 One-Click Unsubscribe

Заголовки `List-Unsubscribe`, `List-Unsubscribe-Post`, `Precedence: bulk`. Edge `email-unsubscribe` обрабатывает GET и POST.

## Click-tracking + UTM

`_shared/email-html-utils.ts` (`processCampaignHtml`): оборачивает `<a href>` через `email-click-redirect?t=<token>&url=<encoded>`, добавляет UTM (`utm_source=sintagma_email`, `utm_medium=email`, `utm_campaign=<slug>`).

## Автосохранение черновика

`localStorage('broadcast_campaign_draft_v1')` каждые 800 мс (debounce). 7 дней TTL.

## Drip-кампании (последовательности)

Таблицы: `email_drip_sequences` (название, активность, источник), `email_drip_steps` (порядок, delay_days/hours, subject, html), `email_drip_subscribers` (email, current_step, next_send_at, status: active/paused/completed/unsubscribed), `email_drip_sends` (журнал). RLS — только админы платформы (`has_role('admin', auth.uid())`). Edge `process-drip-campaigns` (cron jobid 13, `*/5 * * * *`) проверяет suppression, отправляет следующий шаг через SMTP, обновляет `next_send_at` по delay следующего шага, при отсутствии — переводит в `completed`. UI: вкладка «Drip-цепочки» (`DripCampaignsManager`) — создание последовательностей, редактирование шагов, добавление подписчиков (с дедупом), ручной запуск.

## Что ещё не сделано

- A/B-тест по содержанию (не только теме)
- Inbox-превью через Litmus/email-on-acid (платный API)
- Drip: сегментация подписчиков по тегам, автоподписка по событиям (новая регистрация org, бездействие N дней)

## Колонки email_campaigns (актуальный набор)

`scheduled_at`, `started_at`, `completed_at`, `total_recipients`, `sent_count`, `failed_count`, `open_count`, `click_count`, `unsubscribe_count`, `utm_enabled`, `user_paused`, `template_id`, `subject_b`, `ab_test_enabled`, `ab_sample_percent`, `ab_winner`, `ab_winner_picked_at`, `ab_sample_started_at`. Получатель: `subject_variant` (a/b/null).

Cron-задачи: jobid 11 (process-scheduled-campaigns, каждую минуту), jobid 12 (email-ab-pick-winner, каждые 5 минут), jobid 13 (process-drip-campaigns, каждые 5 минут).
