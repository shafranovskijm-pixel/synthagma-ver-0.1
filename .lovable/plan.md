## Задача

1. Добавить подменю «Переместить в категорию» в троеточие карточек **CourseCatalogCard** (вид «Витрина»).
2. Убрать кнопку-карандаш «Редактировать» (открывала редактор в новом окне) и убрать «Редактировать курс» как отдельную кнопку — везде, где она ещё открывает редактор как самостоятельную страницу.
3. Убрать кнопку-карандаш «Редактировать» из строки таблицы списка курсов (`SortableCourseListRow`).
4. В админке убрать `window.open('/course/.../edit', '_blank')` (`SortableCourseRow.tsx`) — клик по названию курса больше не открывает редактор в новой вкладке.

## Файлы

### `src/components/organization/tabs/courses/CourseCatalogCard.tsx`
- Импорт: добавить `DropdownMenuSub/SubTrigger/SubContent/Portal`, иконки `MoveRight`, `Check`, `FolderOpen`. Убрать `Edit`.
- В пропсы добавить `categories?: CourseCategory[]` и `onMoveToCategory?: (course, categoryId: string|null) => void`.
- В `DropdownMenuContent` после «Сгенерировать с ИИ» добавить разделитель и подменю «Переместить в категорию» (тот же шаблон, что в `CourseCardView.tsx`).
- Удалить нижнюю кнопку «Редактировать курс» (строка ~93). Карточка остаётся кликабельной — открытие через `onCourseClick`.

### `src/components/organization/tabs/CoursesTab.tsx`
- В рендер `CourseCatalogCard` пробрасывать `categories={categories}` и `onMoveToCategory={handleQuickMoveCourse}`.
- В строке таблицы (`SortableCourseListRow`) убрать проп `onEdit` (там было `navigate('/course-builder/...')`).

### `src/components/organization/tabs/courses/CourseListRow.tsx`
- Удалить пропс `onEdit` и саму кнопку-карандаш с тултипом «Редактировать». Оставить только «Предпросмотр» и «Переместить в категорию».
- Удалить неиспользуемый импорт `Edit`.

### `src/components/admin/SortableCourseRow.tsx`
- В клике по названию курса заменить `window.open(.../edit, '_blank')` на просто открытие деталей курса через текущий обработчик (или убрать `<button>`-оборот, оставить как обычный текст). Проще: заменить `onClick` на no-op + сделать обычным `<span>`, либо вызвать `onUpdate`/детали. Так как у этой строки нет обработчика «открыть детали», превращаем заголовок в обычный текст без ссылки на новую вкладку (убираем `ExternalLink` и `button`).

## Что НЕ трогаем

- Маршруты `/course-builder/:id` — остаются, потому что встроенный редактор внутри дашборда (`OrganizationDashboard`) использует тот же URL через `window.history.replaceState`.
- Внутренние ссылки в `useCoursesTabLogic.ts` / `useCoursesTab.ts` (`navigate('/course-builder/...')`) — это навигация в том же окне внутри дашборда, не открывает отдельную страницу. Оставляем.
- Маркетплейсные кнопки в `MarketplaceCourseTable.tsx` / `AdminMarketplaceCatalogTab.tsx` — это админский функционал «войти в чужой курс», не относится к запросу.

## Результат

- В витрине у курса в троеточии появляется «Переместить в категорию» с подменю.
- Карандашиков «Редактировать» больше нет ни в карточке-витрине, ни в строке таблицы, ни в админской таблице курсов организации — редактор открывается только встроенным способом по клику на сам курс.
