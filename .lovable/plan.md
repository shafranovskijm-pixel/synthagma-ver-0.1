

## Актуализация настроек ИИ в базе данных

### Проблема
В таблице `ai_settings` большинство контекстов стоит на `provider: gigachat` с моделями `GigaChat-Pro` / `google/gemini-2.5-flash`. Нужно переключить всё на Lovable AI с мощными моделями, GigaChat Max как фоллбэк.

### Изменения

**Миграция БД** — обновить записи в `ai_settings`:

| Контекст | provider → | lovable_model → | gigachat_model → |
|---|---|---|---|
| course_generation | lovable_ai | google/gemini-2.5-pro | GigaChat-Max |
| consultant | lovable_ai | google/gemini-2.5-pro | GigaChat-Max |
| marketplace | lovable_ai | google/gemini-2.5-pro | GigaChat-Max |
| org_default | lovable_ai | google/gemini-2.5-pro | GigaChat-Max |
| image_generation | lovable_ai | google/gemini-3-pro-image-preview | GigaChat-Max |
| pipeline | lovable_ai | google/gemini-2.5-pro | GigaChat-Max |
| tts | salutespeech | (без изменений) | (без изменений) |

Также убрать `allow_org_override` из `extra_config` у `org_default`.

**`src/components/admin/AISettingsManager.tsx`** — обновить дефолтные значения в `loadSettings()`:
- Строка 334: `gigachat_model` по умолчанию → `"GigaChat-Max"`
- Строка 335: `lovable_model` по умолчанию → `"google/gemini-2.5-pro"`

**`src/components/admin/AISettingsManager.tsx`** — порядок в массиве `PROVIDERS`:
- Поставить `lovable_ai` первым в списке (сейчас `gigachat` первым на строке 84-87)

### Файлы
- Миграция БД (SQL UPDATE)
- `src/components/admin/AISettingsManager.tsx`

