## Задача

В карточке курса организации в меню «троеточие» уже есть пункт «Переместить в категорию», но он открывает отдельный диалог. Сделать выбор категории прямо внутри dropdown через подменю — один клик и курс перемещён.

## Что меняем

### 1. `src/components/organization/tabs/courses/CourseCardView.tsx`
- Заменить пункт `DropdownMenuItem` «Переместить в категорию» (строка 194–196) на `DropdownMenuSub` (`shadcn/ui` уже включает `DropdownMenuSubTrigger`, `DropdownMenuSubContent`, `DropdownMenuPortal`).
- В подменю выводим:
  - «Без категории» (если у курса есть `category_id`)
  - Список всех категорий организации с цветным маркером и галочкой у текущей
  - Разделитель + «Создать категорию…» (опционально, открывает существующий `CategoryDialog`)
- Текущая категория курса — disabled.
- Прокинуть в компонент новые пропсы: `categories: CourseCategory[]` и `onMoveToCategory: (course, categoryId: string | null) => void`. Старый `onMove` (открывающий диалог) можно оставить как fallback или удалить.

### 2. `src/components/organization/tabs/CoursesTab.tsx`
- В рендер `CourseCard` / `CategoryFolder` / `SortableCourseListRow` пробросить `categories` и новый обработчик `handleQuickMoveCourse(course, categoryId)`.
- `handleQuickMoveCourse` — переиспользует ту же мутацию, что и `handleMoveCourse` из `useCoursesTabLogic.ts` (`setCourseCategory` / прямой UPDATE `courses.category_id`), без открытия диалога. Показывает toast «Перемещён в …».
- Старый `MoveCourseDialog` оставляем для списочного вида, либо тоже заменяем на тот же механизм (по желанию).

### 3. `src/components/organization/tabs/courses/CategoryFolder.tsx` и `CourseListRow.tsx`
- Прокинуть те же новые пропсы (`categories`, `onMoveToCategory`) до `CourseCard` / кнопки в строке.

## Технические детали

- Подменю в shadcn: `<DropdownMenuSub><DropdownMenuSubTrigger>…</DropdownMenuSubTrigger><DropdownMenuPortal><DropdownMenuSubContent>…</DropdownMenuSubContent></DropdownMenuPortal></DropdownMenuSub>`.
- Иконка категории: цветной круг 8×8 px (`background: category.color`).
- Если категорий >10 — подменю прокручиваемое (`max-h-72 overflow-y-auto`).
- Realtime/локальное состояние списка курсов: после UPDATE — оптимистично менять `category_id` в `setCourses`, как уже делается в `setCourseCategory` (`useCategoryActions.ts`).

## Результат

Наводишь на «⋮» курса → «Переместить в категорию» → сразу видишь список категорий → клик → курс уехал. Без модалки.
