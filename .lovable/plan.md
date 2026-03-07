

# Настройка выбора ИИ-провайдера для организаций

## Что нужно сделать

Добавить поле `ai_provider` в таблицу `organizations` и UI для управления им:
- Два варианта: `gigachat` (по умолчанию) и `lovable_ai`
- В админке — выбор ИИ-провайдера на странице деталей организации
- В конвейере (BulkPipelineWidget) — переключатель ИИ-провайдера для текущей сессии
- Edge functions (`gigachat`, `generate-lesson-content`, `bulk-pipeline`) — принимают параметр `ai_provider` и маршрутизируют вызовы

## Изменения

### 1. Миграция БД
Добавить колонку `ai_provider TEXT DEFAULT 'gigachat'` в таблицу `organizations` с CHECK constraint (`gigachat`, `lovable_ai`).

### 2. `gigachat-client.ts` — обновить `callAI` и `callAIWithTools`
Добавить параметр `preferredProvider`:
- `gigachat` → GigaChat first, Lovable AI fallback (текущее поведение)
- `lovable_ai` → Lovable AI only, без GigaChat

### 3. Edge functions (`gigachat/index.ts`, `generate-lesson-content/index.ts`, `bulk-pipeline/index.ts`)
- Принимать `ai_provider` из body запроса
- Передавать его в `callAI` / `callAIWithTools`

### 4. Клиент — `useBulkPipeline.ts`
- Передавать `ai_provider` в каждый `supabase.functions.invoke("gigachat", { body: { ..., ai_provider } })`

### 5. `BulkPipelineWidget.tsx`
- Добавить переключатель «ИИ-провайдер» (GigaChat / Lovable AI) в секцию настроек
- Хранить в localStorage для сохранения между сессиями

### 6. `OrganizationDetailsView.tsx`
- Добавить Select с выбором ИИ-провайдера рядом с toggle `ai_enabled`
- Сохранять в `organizations.ai_provider`

## Файлы для изменения

| Файл | Что |
|------|-----|
| Новая миграция | `ALTER TABLE organizations ADD COLUMN ai_provider` |
| `supabase/functions/_shared/gigachat-client.ts` | Параметр `preferredProvider` в `callAI`, `callAIWithTools` |
| `supabase/functions/gigachat/index.ts` | Читать `ai_provider` из body |
| `supabase/functions/generate-lesson-content/index.ts` | Читать `ai_provider` из body |
| `supabase/functions/bulk-pipeline/index.ts` | Читать `ai_provider` из body |
| `src/hooks/useBulkPipeline.ts` | Передавать `ai_provider` в invoke |
| `src/components/admin/BulkPipelineWidget.tsx` | UI переключатель провайдера |
| `src/components/admin/OrganizationDetailsView.tsx` | Select ИИ-провайдера |

