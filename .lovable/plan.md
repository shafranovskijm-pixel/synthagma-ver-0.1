

# План: Кастомные TTS-ключи + Починка GigaChat картинок + 3-й ключ GigaChat

## Проблемы и решения

### 1. GigaChat не генерирует картинки в тесте
**Причина**: В `AITestSandbox.tsx` (строка 49) при вызове `generate-image` не передаются `provider` и `model` из настроек. Функция всегда получает `provider: undefined` и использует `lovable_ai` по умолчанию.

**Исправление**: Передать `provider` и `gigachatModel`/`lovableModel` в body запроса `generate-image`.

### 2. Поле для своего API-ключа TTS
Сейчас в секции TTS нет возможности ввести свой ключ. Нужно добавить в `extra_config` поле `custom_tts_api_key` и отобразить поле ввода в секции TTS, когда выбран ElevenLabs (или другой провайдер).

### 3. Поддержка 3-го ключа GigaChat
- Добавить `GIGACHAT_AUTH_KEY_3` в список API-ключей
- Расширить Round-Robin пайплайн — добавить Slot-2 (GigaChat Key 3) помимо текущих Slot-0 и Slot-1
- Сдвинуть Gemini на Slot-3

## Файлы для изменения

### `src/components/admin/AISettingsManager.tsx`
- В `renderApiKeys()`: добавить строку `GIGACHAT_AUTH_KEY_3` / "GigaChat Key 3"
- В `renderPipelineSection()`: добавить 4-ю колонку "Slot-2 (GigaChat Key 3)" в Round-Robin
- В секции TTS: добавить поле Input для кастомного API-ключа (сохраняется в `extra_config.custom_api_key`)
- Добавить возможность ввести свой ElevenLabs ключ или ключ другого TTS-провайдера

### `src/components/admin/ai-settings/AITestSandbox.tsx`
- В ветке `image_generation` передать `provider` и `model` в body:
  ```ts
  body: { prompt, provider, model: provider === 'gigachat' ? gigachatModel : lovableModel }
  ```

### `supabase/functions/generate-image/index.ts`
- Поддержать параметр `gigachat_key` для выбора конкретного ключа (KEY, KEY_2, KEY_3)
- Исправить потенциальный stack overflow в `btoa(String.fromCharCode(...imageBytes))` для больших изображений — заменить на побайтовую конкатенацию

