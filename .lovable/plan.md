
# Подключение Novofon в кабинет продажника

На скриншоте — реальные ключи Novofon (`appid_5032909` + secret). Использую их в качестве общего аккаунта для всех менеджеров, как обсуждали ранее. Записи разговоров и события звонков будут доступны прямо в карточке лида.

## Что делаю

### 1. Секреты
Через `add_secret` запрошу и сохраню (форма — Вы вставите значения из скрина):
- `NOVOFON_API_KEY` = `appid_5032909`
- `NOVOFON_API_SECRET` = `uuelfkypulfbdtd98kdcpoaxfxmxzpkrq8wbra51`
- `NOVOFON_CALLER_ID` (номер, с которого звоним — уточню у Вас в момент запроса)

Ключи `NOVOFON_SIP_LOGIN/PASSWORD` уже сохранены ранее — используем их для WebRTC-плеера.

### 2. База (миграция)
Расширяю уже созданную `call_logs`:
- `provider text default 'novofon'`, `novofon_call_id text`, `recording_url text`, `direction`, `duration_sec`, `status`, `started_at`, `ended_at`, `cost`
- индекс по `novofon_call_id` и `lead_id`
- GRANT + RLS: менеджер видит свои звонки, админ — все

### 3. Edge Functions (server-side, ключи только на сервере)
- `novofon-call-start` — HMAC-SHA1 подпись запроса к `https://api.novofon.com/v1/request/callback` (callback: соединяет `NOVOFON_CALLER_ID` ↔ номер лида), пишет запись в `call_logs` со статусом `initiated`.
- `novofon-webhook` (public, `verify_jwt=false`) — принимает события `NOTIFY_START/END/RECORD` из личного кабинета Novofon, обновляет `call_logs` (длительность, статус, ссылка на запись).
- `novofon-recording-url` — по `call_id` возвращает подписанный URL записи (через API Novofon), чтобы менеджер прослушал в браузере.

### 4. UI на `/sales`
- В `LeadRow` кнопка «Позвонить» → вызывает `novofon-call-start`, показывает тост «Звоним… ответьте на своём телефоне», далее автоматически открывает `LogActivityDialog` с прикреплённым `call_id`.
- В `CompanyDrawer` / карточке лида — вкладка «Звонки»: список из `call_logs` с длительностью, статусом и inline `<audio>` плеером записи (source = edge-функция `novofon-recording-url`, ленивое получение по клику).
- В `ManagerStatsDialog` — счётчик минут разговоров и количество записанных звонков.

### 5. Инструкция для Вас (одноразово)
В личном кабинете Novofon → Настройки → Уведомления добавить webhook:
`https://atxwvjxbqjgkbjlhsdch.functions.supabase.co/novofon-webhook`
события: NOTIFY_START, NOTIFY_END, NOTIFY_RECORD.

Покажу точный URL после деплоя функции.

## Технические детали

- Авторизация Novofon REST: `GET/POST` с параметрами + `HMAC-SHA1(secret, sorted_params)` в заголовке `Authorization: appid_...:signature` (по документации `novofon.github.io/call_api`).
- WebRTC-звонки прямо из браузера оставляю на следующий этап — сейчас `callback`-схема (Novofon сам соединяет менеджера с клиентом через его мобильный/SIP-софтфон): работает мгновенно, без настройки микрофона и без деплоя SIP.js.
- Записи хранятся у Novofon; мы храним только ссылки + метаданные, никакого egress-трафика через нашу инфраструктуру.

## Что НЕ делаю в этой итерации
- WebRTC-виджет со звонком из вкладки браузера (следующий этап после проверки callback-схемы).
- Автотранскрибация записей (можно добавить позже через SaluteSpeech STT).
