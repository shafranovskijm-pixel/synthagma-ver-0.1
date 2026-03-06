## План: подключение GigaChat — ВЫПОЛНЕНО ✅

### Что сделано

**1. Создан общий модуль `_shared/gigachat-client.ts`**
- OAuth-токен с кешированием, исправлен баг `expires_at` (мс → секунды)
- Модель обновлена на `GigaChat-2-Pro`
- TLS bypass через `Deno.createHttpClient` (если доступен)
- Fallback на Lovable AI с retry (3 попытки)
- `callAI()` — текстовый режим, GigaChat → Lovable AI
- `callAIWithTools()` — JSON/tool mode, GigaChat (JSON prompt) → Lovable AI (tool calling)
- `callLovableAIWithTools()` — прямой вызов Lovable AI с tools

**2. `gigachat/index.ts` — рефакторинг**
- Импортирует `callAI` из shared модуля
- Удалён дублированный код OAuth/GigaChat/LovableAI

**3. `generate-course-structure/index.ts` — GigaChat first**
- GigaChat-2-Pro → JSON parse → если ошибка → Lovable AI с tool calling
- 402/429 прокидываются клиенту

**4. `generate-course-content/index.ts` — GigaChat first**
- `generateWithAI` теперь использует `callAIWithTools`
- GigaChat-2-Pro (JSON prompt) → Lovable AI (tool calling)
