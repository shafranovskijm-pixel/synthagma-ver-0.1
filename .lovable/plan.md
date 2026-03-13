

## Аудит: Где используется Lovable AI для изображений вместо GigaChat

### Найденные проблемы

| Место | Провайдер сейчас | Проблема |
|---|---|---|
| **`generate-image/index.ts`** (edge-функция) | По умолчанию `lovable_ai` (строка 244) | Если клиент не передаёт `provider: "gigachat"` — используется Lovable AI |
| **`generate-course-content/index.ts`** → `generateImage()` | Сначала Lovable AI (Gemini), GigaChat только как fallback (строки 367-419) | Lovable AI — **основной**, GigaChat — запасной. Нужно наоборот. |
| **`ContentGeneratorTab.tsx`** → `generateHeroImage()` | Захардкожен `provider: "lovable_ai"` (строка 183) | Принудительно Lovable AI, GigaChat не используется |
| **`BulkContentGenerator.tsx`** | Не передаёт `provider` → дефолт `lovable_ai` (строка 472) | Lovable AI по умолчанию |
| **`BlockEditor.tsx`** → `handleAiGenerate/handleAiEdit` | Не передаёт `provider` → дефолт `lovable_ai` (строки 1107-1133) | Lovable AI по умолчанию |

### Что нужно сделать

#### 1. `supabase/functions/generate-image/index.ts`
- Изменить дефолт провайдера с `"lovable_ai"` на `"gigachat"` (строка 244)
- Добавить round-robin по 3 ключам GigaChat (аналогично SaluteSpeech): при ошибке одного слота — пробовать следующий, fallback на Lovable AI только если все 3 слота GigaChat не сработали

#### 2. `supabase/functions/generate-course-content/index.ts` → `generateImage()`
- Поменять порядок: **сначала GigaChat** (3 слота, round-robin), **потом Lovable AI** как fallback
- Сейчас наоборот (строки 367-419)

#### 3. `src/components/admin/ContentGeneratorTab.tsx`
- Строка 183: заменить `provider: "lovable_ai"` на `provider: "gigachat"`

#### 4. `src/components/admin/BulkContentGenerator.tsx`
- Строка 472: добавить `provider: "gigachat"` в body запроса

#### 5. `src/components/course-builder/BlockEditor.tsx`
- Строки 1107-1108, 1132-1133: добавить `provider: "gigachat"` в body запросов `handleAiGenerate` и `handleAiEdit`

### Результат
- Все генерации изображений (слайды, конструктор, генератор контента, конвейер) будут использовать GigaChat как основной провайдер
- Lovable AI останется только как fallback при сбое всех 3 ключей GigaChat
- 3 ключа GigaChat будут использоваться равномерно через round-robin

