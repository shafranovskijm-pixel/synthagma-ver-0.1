

## Проблема: История генерации не заполняется

### Диагностика

Таблица `generation_history` существует, RLS настроен корректно (authenticated FOR ALL), записи SELECT возвращают 200/OK. Но данных 0 строк.

Причина: **два из четырёх генераторов не пишут в `generation_history`**:

| Генератор | Пишет в историю? |
|---|---|
| `ContentGeneratorTab` (вкладка Генератор) | ✅ Да |
| `BulkContentGenerator` (диалог Bulk) | ✅ Да (через `logHistory`) |
| `AdminMarketplaceManager` auto-fix | ❌ **НЕТ** |
| `useLessonMedia` (кнопка «Написать с AI») | ❌ **НЕТ** |

Пользователь использовал auto-fix и «Написать с AI» — оба не логируют. Поэтому таблица пуста.

### План

#### 1. `AdminMarketplaceManager.tsx` — добавить логирование в auto-fix

В функции `handleAutoFix` (строки ~630-760) после каждого этапа (контент, вопросы, ответы) вставлять записи в `generation_history` с action/details/stream_index/duration_ms.

#### 2. `useLessonMedia.ts` — добавить логирование в «Написать с AI»

В `handleGenerateContent` после успешной генерации (текст + изображение + аудио) вставлять запись в `generation_history` с:
- `course_id` (передаётся в хук)
- `course_title` (нужно добавить параметр или получить из courseId)
- `action: "content"`
- `details` с информацией о сгенерированных блоках/медиа

### Файлы для изменения

| Файл | Что меняется |
|---|---|
| `src/components/admin/AdminMarketplaceManager.tsx` | Добавить insert в `generation_history` после генерации контента, вопросов, ответов в handleAutoFix |
| `src/hooks/useLessonMedia.ts` | Добавить insert в `generation_history` после handleGenerateContent (текст + медиа) |

