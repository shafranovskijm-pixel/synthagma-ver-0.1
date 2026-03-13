

## Полноценная автоматизация курсов: промпты + изображения + аудио

### Анализ эталонных курсов (2 группа безопасности)

Изучил структуру курса `cd38f908` (2 группа). Паттерн каждого текстового урока:

```text
┌─────────────────────────────────────┐
│  [image]   — обложка урока (hero)   │
│  [audio]   — вводная аудиолекция    │
│  [heading] — первый заголовок       │
│  [paragraph] — текст                │
│  [heading] — второй заголовок       │
│  [audio]   — аудио по разделу       │
│  [paragraph] — текст                │
│  ...                                │
└─────────────────────────────────────┘
```

Ключевые наблюдения:
- **Image** — всегда первый блок, тематическая иллюстрация
- **Audio** — вводный абзац урока, озвученный через ElevenLabs/SaluteSpeech, идёт сразу после картинки
- Затем чередуются heading + paragraph + иногда ещё audio

---

### Задача 1: Убрать мусорные вступления из промптов

**Файл**: `supabase/functions/gigachat/index.ts`

В промпт `generate_content` (строки 124–131) добавить правило:

```
6. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО начинать с мета-фраз: «Отлично!», «Подготовлю для вас...», 
   «Учебный материал по курсу...», «Конечно!». Начинай СРАЗУ с содержательного текста: 
   приветствие слушателей («Уважаемые коллеги...») или тематическое введение 
   («Данный урок посвящён...», «Сегодняшний урок рассматривает...»).
```

**Файл**: `src/components/admin/ContentGeneratorTab.tsx`

В `processLesson`, после получения `contentData.content`, вызвать `stripAIIntro(text)` — утилиту, которая regex-ом срежет типичные AI-фразы в начале текста.

---

### Задача 2: Автоматическая генерация обложки урока (image)

После генерации текста для текстового урока — вызвать `generate-image` с промптом на основе заголовка урока и первых 200 символов контента. Результат — base64, загрузить в `course-files/block-images/`, получить URL.

**Файл**: `src/components/admin/ContentGeneratorTab.tsx` — `processLesson()`

После сохранения блоков контента:
1. Вызвать `safeInvoke("generate-image", { prompt: "Educational illustration for: {lessonTitle}. {first200chars}", model: "google/gemini-3.1-flash-image-preview" })`
2. Загрузить base64 в storage
3. Вставить блок `{ type: "image", imageSrc: url }` в начало массива блоков
4. Обновить урок в БД

---

### Задача 3: Автоматическая генерация аудио-вступления

После генерации текста и изображения — взять вводный абзац (первый `paragraph` блок, ~300–500 символов) и озвучить его через ElevenLabs TTS.

**Файл**: `src/components/admin/ContentGeneratorTab.tsx` — `processLesson()`

После вставки image-блока:
1. Извлечь текст первого `paragraph` блока (первые 500 символов)
2. Вызвать `fetch(elevenlabs-tts, { text })` 
3. Загрузить MP3 в `course-files/tts_{uuid}.mp3`
4. Вставить блок `{ type: "audio", content: text, audioUrl: url }` после image-блока (позиция 1)
5. Обновить урок в БД

---

### Задача 4: Улучшить промпт структуры курса

**Файл**: `supabase/functions/gigachat/index.ts` — action `generate_structure` (строка 171)

Обновить промпт, чтобы структура была ближе к эталону:
- Начинать с вводного урока
- Чередовать text → test (после каждых 1-2 лекций)
- Включать 1 practice-урок ближе к концу
- Создавать 8-12 уроков вместо 5-8

---

### Порядок выполнения в `processLesson`

```text
1. generate_content (AI текст)
2. stripAIIntro() — очистка
3. markdownToBlocks() → blocks
4. generate-image → upload → вставить blocks[0]
5. elevenlabs-tts(intro paragraph) → upload → вставить blocks[1]  
6. Сохранить blocks в БД
7. Перейти к тестам/ответам
```

Каждый шаг (image, audio) опционален — если ошибка, пропускаем и продолжаем. Логирование в `generation_history`.

---

### Сводка изменений

| Файл | Изменение |
|---|---|
| `gigachat/index.ts` | Запрет мета-фраз в промпте `generate_content` + улучшение `generate_structure` |
| `ContentGeneratorTab.tsx` | `stripAIIntro()`, авто-image, авто-audio в `processLesson` |

