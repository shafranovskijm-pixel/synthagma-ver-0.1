

## Проблема: Третий API-ключ GigaChat не используется

### Диагностика

Логи edge-функций показывают: **только slot-0 и изредка slot-1**. slot-2 не использовался ни разу.

Корневая причина — **не все генераторы передают параметры маршрутизации** (`ai_provider`, `stream_index`, `gigachat_model`) в edge-функцию. Без этих параметров `callAI()` идёт по дефолтному пути (Lovable AI → GigaChat fallback через `acquireSlot`, который всегда берёт первый свободный слот).

Конкретные проблемы по файлам:

| Генератор | Файл | `ai_provider` | `stream_index` | `CONCURRENCY` |
|---|---|---|---|---|
| ContentGeneratorTab | `ContentGeneratorTab.tsx` | ✅ передаётся | ✅ передаётся | 3 ✅ |
| BulkContentGenerator | `BulkContentGenerator.tsx` | ❌ НЕ передаётся | ✅ taskIndex | 3 ✅ |
| AdminMarketplace auto-fix | `AdminMarketplaceManager.tsx` | ❌ НЕ передаётся | ❌ НЕ передаётся | 2 ❌ |
| Bulk Pipeline | `useBulkPipeline.ts` | ✅ передаётся | ✅ `i % 3` | 5 (свой) |

Также: `callAIRoundRobin()` в `gigachat-client.ts` всё ещё содержит Lovable AI как **первый канал** (строки 563-569), что расходится с предыдущим решением убрать его.

### План исправления

#### 1. `AdminMarketplaceManager.tsx` — добавить маршрутизацию по 3 слотам

- Изменить `CONCURRENCY = 2` → `3`
- Загружать AI-настройки из `ai_settings` (context: `pipeline`) при монтировании
- Передавать `ai_provider`, `gigachat_model`, `stream_index: i % 3` во все вызовы `gigachat` (content, questions, answers)

#### 2. `BulkContentGenerator.tsx` — добавить `ai_provider` и `gigachat_model`

- Загружать AI-настройки из `ai_settings` (context: `pipeline`)
- Передавать `ai_provider`, `gigachat_model` во все вызовы `generate-lesson-content` и `generate-image`
- `taskIndex` уже передаётся корректно как `batchStart + idxInBatch`

#### 3. `gigachat-client.ts` — убрать Lovable AI из `callAIRoundRobin`

- Убрать блок Lovable AI (строки 563-569) из массива `channels` в `callAIRoundRobin`
- Оставить только 3 слота GigaChat как основные каналы, Lovable AI — как последний fallback
- Это обеспечит, что при `round_robin` провайдере все запросы идут строго по 3 GigaChat API

### Файлы для изменения

| Файл | Что меняется |
|---|---|
| `src/components/admin/AdminMarketplaceManager.tsx` | CONCURRENCY=3, добавить ai_provider/gigachat_model/stream_index |
| `src/components/admin/BulkContentGenerator.tsx` | Добавить загрузку AI-настроек и передачу ai_provider/gigachat_model |
| `supabase/functions/_shared/gigachat-client.ts` | Убрать Lovable AI из основных каналов callAIRoundRobin |

