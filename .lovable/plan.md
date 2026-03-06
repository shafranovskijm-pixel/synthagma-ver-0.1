

## План: подключение GigaChat как основного ИИ для конвейера

### Проблема
Сейчас GigaChat падает с ошибкой TLS (`UnknownIssuer`) из-за сертификатов Сбера, и все запросы идут через Lovable AI, расходуя кредиты. Кроме того, функции `generate-course-structure` и `generate-course-content` вообще не используют GigaChat — только Lovable AI.

### Что нужно исправить

**1. Создать общий модуль GigaChat** (`supabase/functions/_shared/gigachat-client.ts`)
- Вынести логику OAuth-токена и вызова GigaChat в переиспользуемый модуль
- Исправить баг: `expires_at` приходит в **миллисекундах** (по документации), а код сравнивает с секундами — токен кешируется неправильно
- Обновить модель с устаревшего `"GigaChat"` на актуальный `"GigaChat-2-Pro"` (лучше для сложных задач по документации)
- Добавить обход TLS: использовать `Deno.createHttpClient` с отключённой проверкой сертификата для доменов Сбера (если доступен в рантайме)
- Fallback на Lovable AI если GigaChat недоступен

**2. Обновить `gigachat/index.ts`**
- Импортировать общий клиент из `_shared/gigachat-client.ts`
- Убрать дублированный код OAuth/вызова

**3. Обновить `generate-course-structure/index.ts`**
- Добавить вызов GigaChat первым с fallback на Lovable AI
- Сейчас функция использует только Lovable AI gateway

**4. Обновить `generate-course-content/index.ts`**
- Функция `generateWithAI` — добавить GigaChat первым с fallback
- Все генерации контента, тестов и структуры пойдут через GigaChat

### Техническая деталь: обход TLS

```text
Deno.createHttpClient({ proxy: undefined })
 → позволяет задать caCerts или отключить проверку
 → если недоступен в Supabase Edge — fallback на Lovable AI
```

Документация Sber подтверждает:
- OAuth: `POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth`
- API: `POST https://gigachat.devices.sberbank.ru/api/v1/chat/completions`
- Модели: `GigaChat-2` (быстрая), `GigaChat-2-Pro` (качественнее), `GigaChat-2-Max` (лучшая)
- Scope: `GIGACHAT_API_PERS` (для физлиц)

### Файлы
- `supabase/functions/_shared/gigachat-client.ts` — новый общий модуль
- `supabase/functions/gigachat/index.ts` — рефакторинг, импорт общего клиента
- `supabase/functions/generate-course-structure/index.ts` — GigaChat first + fallback
- `supabase/functions/generate-course-content/index.ts` — GigaChat first + fallback

