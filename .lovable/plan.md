## Проблема

Логин на `twc1.net` теперь работает (CORS починен ✅), но приложение падает на главной с ошибкой:

```
cannot add `postgres_changes` callbacks for realtime:org-plan-... after `subscribe()`
```

Это значит: Supabase Realtime канал `org-plan-{orgId}` пересоздаётся, но старый instance не успевает удалиться, и на него повторно навешивается `.on('postgres_changes', ...)` уже после `.subscribe()`. В StrictMode / при быстром ре-рендере хука это вылазит наружу.

## Что исправить

### 1. `src/hooks/useSubscriptionLimits.ts` — защитить realtime-подписку

Сейчас:
```ts
const channel = supabase.channel(`org-plan-${organizationId}`).on(...).subscribe();
return () => { supabase.removeChannel(channel); };
```

Заменить на паттерн с уникальным именем канала + ref-флагом, чтобы:
- Каждый эффект создавал свой уникальный канал (`org-plan-${orgId}-${Math.random()}`), что исключает коллизии имён.
- Cleanup гарантированно удалял именно свой канал.
- `.on()` вызывался строго до `.subscribe()` (так и есть, но добавим явный гард: если канал уже подписан — пропустить).

Это устранит ошибку и в StrictMode, и при быстрой смене `organizationId`.

### 2. Проверить, что Realtime WebSocket идёт через ваш прокси

На `twc1.net` фронт ходит на Supabase через `api.sintagma.com.ru/sb-api/...`, но WebSocket для Realtime — отдельный путь (`/sb-realtime` в вашем nginx). Нужно убедиться:
- `src/utils/proxyFetch.ts` / клиент Supabase подменяет realtime endpoint, когда работает в proxy-режиме.
- Если нет — Realtime будет ходить напрямую на `*.supabase.co` и блокироваться у пользователей с ограничениями.

Я прочитаю `proxyFetch.ts` и `client.ts`, и если realtime не проксируется — добавлю подмену через `realtime.setAuth`/конфиг URL.

### 3. Поиск других мест с тем же паттерном

Просканирую проект на `.channel(...).on('postgres_changes', ...).subscribe()` без уникального имени канала, и применю тот же фикс точечно (если найду явные дубли имён, как `org-plan-${id}`).

## Технические детали

**Файлы для правки:**
- `src/hooks/useSubscriptionLimits.ts` — уникализировать имя канала, добавить guard.
- `src/utils/proxyFetch.ts` (если требуется) — подмена Realtime URL в proxy-режиме.

**Ничего не ломаем:** Поведение хука не меняется, только устраняется race condition.

## Что НЕ делаем сейчас

- Не трогаем DNS / nginx / VDS — текущий конфиг работает.
- Не делаем dual-domain (.рф vs .com.ru) — это отдельная задача после стабилизации twc1.net.

После применения фикса попросим вас перезагрузить страницу на twc1.net и проверить, что главная открывается.
