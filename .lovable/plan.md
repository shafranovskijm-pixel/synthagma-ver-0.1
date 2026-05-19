# Автологирование сетевых ошибок клиентов

## Цель

Собирать все упавшие сетевые запросы (CORS, 4xx/5xx, network failure, timeout) со всех устройств пользователей в одну таблицу. В админке — фильтры, графики, детали запроса. Это позволит диагностировать проблемы вроде текущей с `/sb-storage/` без ручных скриншотов от пользователей.

## Что логируем

Для каждой ошибки:
- URL и метод (без query-string с токенами)
- HTTP-статус (или `network_error` / `cors_error` / `timeout` / `aborted`)
- Текст ошибки, response body (первые 2 КБ)
- Хост, через который шёл запрос (прямой Supabase / прокси VDS / Lovable Cloud)
- User-Agent, домен страницы (`sintagma.com.ru`, `синтагма.рф`, preview)
- `user_id` (если авторизован), `organization_id` (если есть)
- Длительность запроса, размер payload
- Browser-side timestamp + server-side received_at

## Архитектура

```
fetch (глобальный wrapper)
  → ошибка
  → буфер в памяти (батч до 10 событий / 5 сек)
  → sendBeacon → edge fn log-client-error
  → таблица client_error_logs (RLS)
  → AdminClientErrorsTab (фильтры/график/детали)
```

## Этапы

### 1. Таблица + RLS (миграция)

`client_error_logs`:
- domain-fields: `url_path`, `url_host`, `method`, `status`, `error_kind`, `error_message`, `response_snippet`, `request_route`, `user_agent`, `page_url`, `proxy_used`, `duration_ms`, `user_id`, `organization_id`, `occurred_at`
- индексы по `occurred_at desc`, `status`, `error_kind`, `organization_id`
- партиционирование/auto-cleanup через cron (хранить 30 дней)

RLS:
- INSERT — только через edge function (service role), клиент не пишет напрямую
- SELECT — только глобальные админы (`has_admin_staff_role`) + владельцы организации видят свои `organization_id`

### 2. Edge function `log-client-error`

- `verify_jwt = false` (чтобы ловить даже ошибки без сессии)
- Принимает массив до 50 событий
- Rate limit: 100 запросов/мин с одного IP
- Валидация Zod, обрезка строк до лимитов
- Подмешивает `user_id`/`org_id` если есть валидный JWT в Authorization
- INSERT batch в `client_error_logs`

### 3. Клиентский сборщик `src/utils/errorReporter.ts`

- Patch глобального `window.fetch` (один раз в `main.tsx`)
- При ошибке/non-2xx (опционально только 4xx ≥ 408 и 5xx) — push в буфер
- Отдельная обёртка для `supabase.functions.invoke` + storage
- Дедупликация: одинаковые ошибки за 10 сек схлопываются в counter
- Sampling: 100% ошибок, 0% успехов (логируем только проблемы)
- Sendbeacon при `pagehide`, `visibilitychange`
- Исключения: не логируем сам `log-client-error`, аналитику, рекламу

Фильтр шумов: игнорируем `AbortError` от React Query, отменённые загрузки.

### 4. Админка `AdminClientErrorsTab`

Маршрут `/admin/diagnostics/client-errors`:
- **Сверху**: KPI-карточки (за 24ч / 7д) — всего ошибок, уникальных пользователей, топ-1 endpoint
- **График** ошибок по часам (recharts) с разделением по `error_kind`
- **Фильтры**: период, `error_kind`, `status`, `url_host`, `proxy_used`, `organization_id`, `user_id`, search по url
- **Таблица** с пагинацией: время, статус, метод+url, ошибка, юзер/орг, UA
- **Drawer с деталями** по строке: full payload, response snippet, headers, повторы за период

### 5. Очистка

Cron `cleanup-client-error-logs-daily` (04:00 UTC) — удаление записей старше 30 дней.

## Технические детали

- Edge function путь: `supabase/functions/log-client-error/index.ts`
- Клиент-обёртка в `src/utils/errorReporter.ts` + инициализация в `src/main.tsx` после `createRoot`
- Существующий `proxyFetch.ts` уже патчит fetch для прокси — добавляем хук перед return для логирования
- `supabase-js` storage не идёт через `proxyFetch` напрямую, но fetch global тоже патчится — покроем оба пути
- Тип `ErrorKind`: `'http_4xx' | 'http_5xx' | 'network_error' | 'cors_error' | 'timeout' | 'aborted'`
- Размер буфера в localStorage на случай оффлайна (макс 50 событий, отправляем при возврате online)
- Не логируем PII: query string обрезаем после `?`, body запроса не сохраняем

## Что НЕ входит в этот план

- Алерты в Telegram/email при всплеске ошибок (можно добавить позже)
- Логирование успешных запросов / APM-метрик
- Source map symbolication JS-ошибок (отдельная задача)
- Service Worker перехват (только fetch на главном потоке)
