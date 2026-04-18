
## Что строим

В **редакторе курса** (`CourseBuilder` — открывается и как `/course-builder/:id`, и встроен во вкладку «Редактор» в `CourseDetailsContent`) нужно:

1. **Слева — закреплённое меню уроков** (как навигация: `1. Знакомство`, `2. Создание…`, `3. Управление…`). Клик → плавный скролл к уроку, drag-and-drop (тот же `handleDragEnd`).
2. **Справа — панель «Добавить урок»** должна реально оставаться закреплённой (sticky) при скролле, в том числе **во встроенном режиме** во вкладке «Редактор».

### Почему сейчас «странно»

- В `src/pages/CourseBuilder.tsx` есть только grid `2 кол. слева (уроки) + 1 кол. справа (Добавить урок)`. **Левого меню навигации по урокам нет вообще** — есть только сами карточки уроков в основной колонке.
- Правая панель имеет `lg:sticky lg:top-24`, но во встроенном режиме (внутри `CourseDetailsContent` → tab `editor`) её родитель — панель вкладки с собственным скроллом, поэтому sticky привязывается не к окну, а к этому контейнеру и фактически «не работает».
- В предыдущих итерациях я по ошибке добавил sidebar в `CourseEditor.tsx` (`/course/:id/edit`) — но пользователь редактирует курс **через `CourseBuilder`**, который не виден из той страницы.

## Что делаю

### 1. Новый компонент `CourseBuilderLessonsNav` (слева)

Файл: `src/components/course-builder/CourseBuilderLessonsNav.tsx`.

- Sticky на десктопе (`lg:sticky lg:top-24`), ширина ~ `w-64`.
- Список уроков с номером, иконкой типа (текст/видео/тест/слайды/аудио/обратная связь/задание) и заголовком.
- DnD через `@dnd-kit` (тот же `handleDragEnd` из `useCourseBuilder`).
- Активный урок (тот, что в зоне видимости) подсвечивается.
- Клик по уроку → плавный скролл к карточке + раскрытие аккордеона (если закрыт).
- На мобильном — спрятан, открывается через плавающую кнопку «Уроки (N)» в `<Sheet>` (по аналогии с уже сделанным `CourseLessonsSidebar`).
- Стиль — soft-теневая плашка (`shadow + bg-card`, без `backdrop-blur`, согласно `mem://style/sidebar-visual-standard`).

### 2. Layout `CourseBuilder.tsx`

Заменить grid на 3-колоночный:
```
[ LessonsNav (sticky) | Контент (Информация + Уроки) | Добавить урок (sticky) ]
   lg:w-64                  flex-1 min-w-0                       lg:w-72
```
- Использовать flex с `lg:sticky` на боковых колонках (а не `lg:sticky` внутри grid-cell, что не всегда работает в embedded-режиме).
- Закрепление через `position: sticky; top: 6rem` — работает и в embedded-вкладке, потому что у `CourseDetailsContent` основной скролл — окно браузера (вкладка `editor` ничего не оборачивает в overflow-контейнер; проверил: `<div className="flex-1 p-6 min-w-0">` без overflow).
- На очень узких экранах (`< lg`) обе боковые колонки скрываются; «Уроки» — через Sheet с floating-кнопкой; «Добавить урок» — через Sheet с floating-кнопкой `+ Добавить`.

### 3. Подключить «активный урок»

В `useCourseBuilder.ts` (или прямо в `CourseBuilder.tsx`) добавить:
- `activeLessonId` + `setActiveLessonId`.
- `IntersectionObserver` по `[data-lesson-id]` карточкам — обновляет `activeLessonId`.
- `scrollToLesson(id)` — `element.scrollIntoView({ behavior: 'smooth', block: 'start' })` + раскрыть карточку через `toggleLesson(id)` если она свёрнута.

### 4. Карточки уроков — атрибут `data-lesson-id`

В `SortableLessonItem.tsx` обернуть корневой `<div>` в `data-lesson-id={lesson.id}` и добавить `scroll-mt-24` для отступа от sticky-хедера при скролле.

## Файлы

**Новые:**
- `src/components/course-builder/CourseBuilderLessonsNav.tsx`

**Правки:**
- `src/pages/CourseBuilder.tsx` — новый 3-колоночный layout, sticky колонки, mobile-Sheet, IntersectionObserver, `scrollToLesson`.
- `src/components/course-builder/SortableLessonItem.tsx` — `data-lesson-id` + `scroll-mt-24` на корневом div, проброс `isExpanded` если нужно (для авто-раскрытия по клику из навигации).
- `src/hooks/useCourseBuilder.ts` — экспорт `expandedLessonIds` уже есть через `toggleLesson`; добавить utility `expandLesson(id)` (если ещё нет — иначе использовать `toggleLesson` с проверкой).

## Этапы

1. Создать `CourseBuilderLessonsNav` (sticky-навигация + DnD + клик-навигация + mobile Sheet).
2. Переделать grid в `CourseBuilder.tsx` на 3-колоночный flex; убедиться, что обе боковые колонки sticky и в standalone, и в embedded режиме.
3. Добавить `data-lesson-id` на карточки + IntersectionObserver + `scrollToLesson`.
4. Проверка end-to-end:
   - Открыть курс → вкладка «Редактор» → слева видно меню уроков `1, 2, 3, …`;
   - Клик по уроку 5 → плавный скролл, карточка раскрывается, в меню урок подсвечен;
   - Перетаскивание уроков в меню меняет порядок и в основной области;
   - Прокрутка вниз — обе панели (слева и справа) остаются на экране;
   - На мобильном — обе панели спрятаны, открываются по floating-кнопкам.
