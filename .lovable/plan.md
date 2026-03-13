

## План: Эталонная генерация курсов

### Проблемы сейчас

| Компонент | Изображения | Аудио | Слайды |
|---|---|---|---|
| **ContentGeneratorTab** (админ) | ✅ GigaChat | ❌ ElevenLabs (устарело) | ❌ Не генерирует |
| **BulkContentGenerator** (конструктор) | ❌ Не генерирует | ❌ Не генерирует | ❌ Не генерирует |

### Что нужно сделать

#### 1. ContentGeneratorTab — переключить аудио на SaluteSpeech
- Строки 196-235: заменить вызов `elevenlabs-tts` на `salutespeech-tts`
- Формат запроса: `{ text, voice: "natalya", format: "opus" }` 
- Ответ приходит как `ArrayBuffer` → загрузка в storage как `.ogg`

#### 2. BulkContentGenerator — добавить генерацию изображений и аудио
После генерации текста (Phase 2, строки 196-249), для каждого урока:
- **Изображение**: вызвать `generate-image` с `provider: "gigachat"`, вставить блок `type: "image"` в начало контента
- **Аудио**: вызвать `salutespeech-tts` для первого абзаца (>50 символов), вставить блок `type: "audio"` после изображения
- Добавить новый статус `"generating_image"` (уже есть в типе `LessonStatus`) для отображения прогресса

#### 3. BulkContentGenerator — добавить генерацию слайдов
- Для уроков типа `slider`: вызвать Edge-функцию `generate-course-content` с `action: "slides"`
- Она уже генерирует 5-8 слайдов с изображениями через GigaChat
- Сохранить результат в формате `SliderContent` (JSON со структурой `{ slides: [...] }`)

#### 4. Обновить UI статусов в BulkContentGenerator
- Показывать фазы: текст → изображение → аудио для каждого урока
- Для slider-уроков: генерация слайдов (отдельная фаза)

### Порядок генерации на каждый урок

```text
text/practice урок:
  1. Генерация текста (generate-lesson-content)
  2. Генерация изображения (generate-image, provider: gigachat)
  3. Генерация аудио первого абзаца (salutespeech-tts)
  4. Сборка блоков: [image, audio, ...текстовые блоки]
  5. Сохранение в БД

slider урок:
  1. Генерация слайдов с изображениями (generate-course-content, action: slides)
  2. Сохранение в формате SliderContent
```

### Файлы для изменения

- `src/components/admin/ContentGeneratorTab.tsx` — заменить ElevenLabs на SaluteSpeech
- `src/components/admin/BulkContentGenerator.tsx` — добавить фазы генерации изображений, аудио и слайдов

