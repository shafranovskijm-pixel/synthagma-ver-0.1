

## Задачи

### 1. Дефолтный провайдер — SaluteSpeech
В `getStoredTTSSettings` изменить fallback-провайдер с `'elevenlabs'` на `'salutespeech'`.

**Файл:** `src/components/student/TTSSettingsDialog.tsx`
- Строка 86: `const defaultProvider = (adminDefaults?.provider as TTSProvider) || 'salutespeech';`

### 2. В студенческом интерфейсе — выпадающий выбор голоса прямо в хедере
Вместо отдельного диалога настроек, добавить компактный Popover/DropdownMenu рядом с кнопкой «Озвучить» в `CourseLearning.tsx`. При нажатии на шестерёнку — показывать список голосов SaluteSpeech (если провайдер salutespeech) для быстрого переключения. Выбор сохраняется в localStorage.

**Файл:** `src/pages/CourseLearning.tsx`
- Заменить кнопку `Settings2` → `DropdownMenu` с голосами из `SALUTE_VOICES`
- При выборе голоса — вызывать `setTtsSettings` + `saveTTSSettings`

### 3. В конструкторе курсов — выбор голоса для превью озвучки
Сейчас в CourseBuilder нет TTS-функционала. Добавить:

**Файл:** `src/pages/CourseBuilder.tsx`
- Кнопка «Озвучить» + выбор голоса в хедере каждого урока (SortableLessonItem)

**Файл:** `src/components/course-builder/SortableLessonItem.tsx`
- Добавить кнопку озвучки с выбором голоса для текстовых уроков
- Голос сохраняется в localStorage (те же `tts-settings`)

### 4. Кэширование аудио — не делать повторный запрос
Реализовать кэш синтезированного аудио в `useCourseLearning.ts`, чтобы при повторном нажатии «Озвучить» на тот же текст с тем же голосом — воспроизводился сохранённый blob без повторного запроса к edge-функции.

**Файл:** `src/hooks/useCourseLearning.ts`
- Добавить `Map<string, string>` (ключ = `${voice}:${hash(text)}`, значение = blob URL)
- В `speakSalute` — проверять кэш перед запросом
- Очищать кэш при unmount

### Файлы для изменения
1. `src/components/student/TTSSettingsDialog.tsx` — дефолт `salutespeech`
2. `src/pages/CourseLearning.tsx` — выпадающее меню выбора голоса в хедере
3. `src/hooks/useCourseLearning.ts` — кэширование аудио blob'ов
4. `src/components/course-builder/SortableLessonItem.tsx` — кнопка озвучки + выбор голоса

