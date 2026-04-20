

## Проблема
Прошлый раз правка применилась в `CourseEditor.tsx`, но в кабинете организации используется **`CourseBuilder.tsx`** (вкладка «Конструктор» курса). Поэтому правая панель «Добавить урок» с 8 плитками всё ещё на месте.

## Что сделаем

### 1. Удалить правый sticky-сайдбар «Добавить урок» в `src/pages/CourseBuilder.tsx`
- Удалить весь блок `<aside>` (строки ~295–315) с правой колонкой и плитками `AddLessonGrid`.
- Удалить мобильный плавающий триггер «+ Добавить» справа (строки ~319–335) — он дублирует функционал.
- В пустом-стейте (строка 268) кнопка «Добавить урок» остаётся как есть.

### 2. Расширить рабочую область
- Контейнер `flex gap-4 lg:gap-6 items-start` (строка 200): после удаления правой колонки центральная `flex-1 min-w-0` сама займёт всю ширину справа от левого сайдбара уроков.
- Никаких grid-cols менять не нужно — flex уже растянет.

### 3. Добавить кнопку «+ Добавить урок» в левый сайдбар `CourseBuilderLessonsNav.tsx`
- В `NavList` над списком уроков (между `onBack` и блоком «Уроки (N)») добавить кнопку с `DropdownMenu`.
- Дропдаун содержит **8 типов** + AI:
  - Текст (`text`) · Видео (`video`) · Тест (`test`) · Слайды (`slider`) · Аудио (`audio`) · Обратная связь (`feedback`) · Задание (`homework`) · ИИ-преподаватель (`ai_avatar`)
  - Отдельный пункт «Создать с помощью ИИ» → открывает AI Generate Dialog
- Иконки и цвета — те же, что в `AddLessonGrid` (берём из `lessonIcons`/`lessonColors` из `LessonTypeConfig`).
- Кнопка работает и в desktop sticky-панели, и в mobile Sheet — общий `NavList`.

### 4. Прокинуть обработчики через props
- В `CourseBuilderLessonsNav` добавить пропсы:
  - `onAddLesson: (type: LessonType) => void`
  - `onOpenAIDialog: () => void`
- В `CourseBuilder.tsx` (строка 202) передать `onAddLesson={addLesson}` и `onOpenAIDialog={() => setShowAIGenerateDialog(true)}`.

### 5. «Информация о курсе» в аккордеон (`CourseBuilder.tsx`)
- Блок с заголовком «Информация о курсе» (строки 215–219) обернуть в `<Accordion type="single" collapsible>` из `@/components/ui/accordion` (без `defaultValue`, чтобы был свёрнут).
- Триггер — компактная строка с иконкой `BookOpen` и текстом «Информация о курсе».
- Внутри `AccordionContent` — поля «Название» и «Описание».

## Файлы к изменению
- `src/pages/CourseBuilder.tsx` — удалить правую `<aside>`, удалить мобильный плавающий «+ Добавить», обернуть «Информация о курсе» в Accordion, добавить пропсы для `CourseBuilderLessonsNav`.
- `src/components/course-builder/CourseBuilderLessonsNav.tsx` — добавить кнопку «+ Добавить урок» с `DropdownMenu` (8 типов + AI) над списком уроков.

## Что НЕ трогаем
- Логика `addLesson`, автосейв, drag-and-drop, AI-диалог — без изменений.
- `CourseEditor.tsx`, `CourseLessonsSidebar.tsx` — это другой редактор, прошлая правка остаётся для своих сценариев.
- БД, миграции, RLS — не нужны.

