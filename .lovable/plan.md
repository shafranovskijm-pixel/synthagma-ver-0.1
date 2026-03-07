

## План: Убрать переключатель «Разрешить организациям менять провайдера» + установить Lovable AI по умолчанию с фоллбэком на GigaChat Max

### Что делаем

1. **Убрать переключатель `allow_org_override`** из `renderOrgDefault()` в `AISettingsManager.tsx` — организации не смогут менять провайдера, только админ управляет этим.

2. **Установить дефолтную модель для организаций**: самая мощная Lovable AI модель — `openai/gpt-5` (или `google/gemini-2.5-pro`). При исчерпании токенов — фоллбэк на GigaChat Max.

3. **В `gigachat-client.ts`** убедиться, что дефолтная модель в `callAI()` использует мощную модель Lovable AI, а фоллбэк — `GigaChat-Max` вместо `GigaChat-Pro`.

### Изменения

**`src/components/admin/AISettingsManager.tsx`**
- В `renderOrgDefault()` (строки 563-578): удалить блок с `Switch` и `allow_org_override` (строки 570-576). Оставить только `renderProviderSelect("org_default")`.

**`supabase/functions/_shared/gigachat-client.ts`**
- В `callAI()` (строка 592): изменить дефолтную модель GigaChat с `"GigaChat-Pro"` на `"GigaChat-Max"` — чтобы при фоллбэке использовалась максимальная модель.
- В `callAI()` (строка 593): изменить дефолтную модель Lovable AI с `"google/gemini-2.5-flash"` на `"google/gemini-2.5-pro"` — самая мощная по умолчанию.
- В `callAIWithTools()` (строка 635): аналогично обновить дефолт lovableModel на `"google/gemini-2.5-pro"`.

### Файлы
- `src/components/admin/AISettingsManager.tsx`
- `supabase/functions/_shared/gigachat-client.ts`

