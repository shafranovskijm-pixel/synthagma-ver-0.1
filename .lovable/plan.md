

## План: Переключение на GigaChat (3 API-ключа) без использования Lovable AI

### Проблема

Сейчас в базе данных для **всех контекстов** (pipeline, course_generation, и т.д.) выставлен провайдер `lovable_ai`. GigaChat-пул из 3 ключей (`GIGACHAT_AUTH_KEY`, `_2`, `_3`) инициализируется корректно (логи: `Pool initialized with 3 slot(s)`), но ни один запрос не проходит через GigaChat — расходуются только токены Lovable AI.

Причина: клиентский код читает `ai_settings.provider` из БД → получает `lovable_ai` → передаёт `ai_provider: "lovable_ai"` → серверная функция `callAI()` использует Lovable AI напрямую, минуя GigaChat.

### Что нужно сделать

#### 1. Обновить `ai_settings` в БД

Сменить провайдер с `lovable_ai` на `gigachat` для трёх контекстов:
- `pipeline` (Конвейер)
- `course_generation` (Генерация курсов)
- `image_generation` — оставить `lovable_ai` (GigaChat не генерирует качественные изображения)

SQL-миграция:
```sql
UPDATE ai_settings SET provider = 'gigachat' WHERE context IN ('pipeline', 'course_generation');
```

#### 2. `ContentGeneratorTab.tsx` — принудительное использование 3 GigaChat-слотов

Сейчас код делит уроки на 3 потока (`STREAMS = 3`) и вызывает `gigachat` edge-функцию с `stream_index: 0/1/2`. Но edge-функция не использует `stream_index` для маршрутизации по слотам, когда `ai_provider` = `gigachat` без `taskIndex`.

**Изменения:**
- Загружать `ai_settings` для `course_generation` (сейчас грузится `pipeline`) — или оставить `pipeline`, но переключить на `gigachat`
- Дефолт `aiProvider` изменить с `"gigachat"` (в коде) — он и так `"gigachat"`, но БД перебивает на `lovable_ai`. После обновления БД проблема исчезнет.

#### 3. `useBulkPipeline.ts` — маршрутизация `stream_index` / `taskIndex`

Конвейер уже передаёт запросы через `safeInvoke("gigachat")` — но **не передаёт `stream_index`**. Серверная функция `callAI()` при `provider=gigachat` + `taskIndex` маршрутизирует: `taskIndex % slots.length` → конкретный слот.

**Изменения:**
- В `parallelMap` передавать `stream_index: index` в тело запроса (`body`), чтобы edge-функция маршрутизировала по слотам детерминированно
- Это затронет вызовы `generate_answers`, `generate_content`, `verify_answers`

#### 4. `bulk-pipeline/index.ts` (серверный конвейер)

Уже использует `taskCounter.value++` и передаёт его в `callAI(... taskIndex)`. Уже работает правильно при `ai_provider: "gigachat"`. После обновления БД (`pipeline.provider = "gigachat"`) и передачи `aiProvider` из клиента — будет использовать 3 слота.

#### 5. `gigachat/index.ts` (edge-функция)

Уже передаёт `stream_index` в `callAI(..., stream_index)` — серверная функция `callAI()` при `preferredProvider === "gigachat"` + `taskIndex` вызывает `useSlotDirect(taskIndex % slots.length)`, что распределяет нагрузку по 3 ключам.

Никаких изменений не нужно.

### Сводка изменений

| Файл/Место | Изменение |
|---|---|
| **SQL-миграция** | `UPDATE ai_settings SET provider = 'gigachat' WHERE context IN ('pipeline', 'course_generation')` |
| `ContentGeneratorTab.tsx` | Убедиться, что `stream_index` передаётся и используется как `taskIndex` для маршрутизации по GigaChat-слотам |
| `useBulkPipeline.ts` | Добавить `stream_index: i` (порядковый номер задачи) в body каждого вызова `safeInvoke("gigachat")`, чтобы edge-функция распределяла по 3 слотам |
| `useServerPipeline.ts` | Передавать `ai_provider: aiProvider` (будет `"gigachat"` из БД) — уже делает |

### Результат

После этих изменений:
- Все 3 ключа GigaChat будут использоваться параллельно
- Токены GigaChat (3 млн) начнут расходоваться
- При ошибке конкретного слота — автоматический fallback на другие слоты, затем на Lovable AI
- Изображения по-прежнему через Lovable AI (Gemini)

