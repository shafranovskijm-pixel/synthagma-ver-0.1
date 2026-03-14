

## Диагностика и план исправления

### Найденные проблемы

**1. Только 2 изображения вместо 3**
В строке 711 `AdminMarketplaceManager.tsx` есть проверка `if (textContent.length < 100) return;` — если у третьего урока мало текстового контента (например, он состоит в основном из callout-блоков или списков), он молча пропускается. Также `analyze_visuals` может вернуть пустой массив без ошибки, и урок просто пропускается без логирования.

**Исправление**: Снизить порог до 50 символов, а также добавить логирование пропущенных уроков в `generation_history` с пометкой "skipped", чтобы было видно, почему урок не обогатился.

**2. Пустой аккордеон "Дополнительные рекомендации"**
В `generate-lesson-content/index.ts` и `gigachat/index.ts` AI генерирует accordion-блоки через tool calling. Блок создаётся с `accordionTitle`, но если AI решает положить весь полезный текст в `accordionTitle` а `content` оставить пустым (или наоборот), блок выглядит пустым. Нужно добавить валидацию: если accordion-блок имеет пустой `content`, либо пропускать его, либо заполнять placeholder-текстом.

**Исправление** в `useLessonMedia.ts` (строка 237-240) и в `generate-lesson-content/index.ts` — при создании accordion-блока проверять, что content не пустой. Если пустой — использовать accordionTitle как content fallback.

**3. Нет подписи к сгенерированным изображениям**
Строка 744-746 `AdminMarketplaceManager.tsx` создаёт image-блок без `imageAlt`. Промпт уходит в `content`, но `imageAlt` не заполняется — в итоге подпись пустая.

**Исправление**: Использовать `imageVisual.prompt` как значение `imageAlt` при создании image-блока. Это даст понятную подпись вроде "рабочий в каске проверяет огнетушитель".

### Файлы для изменения

| Файл | Что менять |
|---|---|
| `src/components/admin/AdminMarketplaceManager.tsx` | 1) Снизить порог текста 100→50. 2) Логировать skipped уроки. 3) Добавить `imageAlt: imageVisual.prompt` при создании image-блока |
| `supabase/functions/generate-lesson-content/index.ts` | Добавить постобработку: фильтровать accordion-блоки с пустым content или использовать title как fallback |
| `src/hooks/useLessonMedia.ts` | При маппинге блоков проверять accordion: если content пустой, ставить accordionTitle как content |

