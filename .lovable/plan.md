

## Заменим dropdown на Dialog-popup с плитками типов уроков

Сейчас при клике «+ Добавить урок» открывается простой dropdown-список. Сделаем красивый popup-диалог в стиле Skill Space (как на скриншоте), но в нашем Teal/Cyan стиле.

### Что в popup
Заголовок: **«Выберите тип занятия»**

Сетка плиток (4 в ряд на десктопе, 2 на мобиле). Каждая плитка — иконка + подпись, при ховере/выборе подсвечивается primary-рамкой и заливкой `primary/5`.

**7 типов** (видео убираем, так как видео можно вставлять прямо в текстовый блок):
1. **Текст** — `FileText`
2. **Тест** — `CheckSquare`
3. **Слайды** — `Presentation`
4. **Аудио** — `Headphones`
5. **Обратная связь** — `MessageSquare`
6. **Задание** — `BookCheck`
7. **ИИ-преподаватель** — `Sparkles`

Под сеткой — **описание выбранного типа** (короткий текст: что можно делать в этом уроке). Например, для «Текст»: «Может содержать форматированный текст, видео, аудио и изображения. Прикрепляйте файлы для скачивания.»

Внизу — две кнопки: **«Отмена»** (variant=outline) и **«Далее»** (btn-gradient). «Далее» создаёт урок выбранного типа и закрывает popup.

Отдельная кнопка-ссылка внизу popup: **«✨ Создать с помощью ИИ»** — открывает существующий AI-диалог.

### Технические изменения

**Файл:** `src/components/course-builder/CourseBuilderLessonsNav.tsx`

1. Заменить `DropdownMenu` внутри `AddLessonButton` на `Dialog` из `@/components/ui/dialog`.
2. Внутри `DialogContent`:
   - локальный state `selectedType: LessonType` (по умолчанию `"text"`)
   - массив `LESSON_TYPE_OPTIONS` с `{ type, icon, label, description }` — без `video`
   - сетка `grid grid-cols-2 sm:grid-cols-4 gap-3` с плитками-кнопками
   - блок описания под сеткой
   - футер с «Отмена» / «Далее» / «Создать с помощью ИИ»
3. Кнопка-триггер «+ Добавить урок» остаётся той же (`btn-gradient w-full`).
4. После «Далее» вызывается `onAddLesson(selectedType)` + `afterAction?.()` (закрывает mobile Sheet).

### Что НЕ трогаем
- `src/pages/CourseBuilder.tsx` — без изменений (props те же).
- Логика `addLesson`, `LessonTypeConfig`, AI-диалог — без изменений.
- Тип `LessonType` остаётся с `video` (на случай старых уроков), просто убираем из popup-выбора.
- БД, миграции, RLS — не нужны.

### Файлы к изменению
- `src/components/course-builder/CourseBuilderLessonsNav.tsx` — заменить `AddLessonButton` (Dropdown → Dialog с плитками + описанием + футером).

