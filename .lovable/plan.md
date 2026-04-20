

## Заменить три кнопки на «...» меню в шапке курса

На скрине — оверлей с тремя кнопками (**Просмотр / Редактировать / Удалить**) поверх обложки курса в `/organization/course/:courseId`. Файл — `src/components/organization/CourseDetailsContent.tsx`, строки 148–152.

### Что меняем
1. Удалить блок `<div className="flex gap-2 flex-wrap">` с тремя кнопками.
2. Вместо него — иконка-кнопка `MoreVertical` (`...`) в правом верхнем углу баннера (рядом с `onBack` слева, но справа). Триггер `DropdownMenu` (shadcn).
3. Стиль триггера: круглая полупрозрачная кнопка `bg-white/15 backdrop-blur-md border border-white/20 text-white hover:bg-white/25` h-9 w-9 — в тон существующей кнопке «Все курсы» сверху-слева.

### Пункты меню
1. **Просмотр** (`Eye`) → `onTabChange("preview")`
2. **Редактировать** (`Edit`) → `onTabChange("editor")`
3. **Изменить обложку** (`ImagePlus`) → открыть скрытый `<input type="file" accept="image/*">`, после выбора — загрузить файл в storage `course-files` (путь `covers/{courseId}/{timestamp}.{ext}`), обновить `courses.cover_image_url`, вызвать `onCourseUpdated?.()`. С тостами «Загружаем…» / «Готово».
4. **Сгенерировать с ИИ** (`Wand2`) → `supabase.functions.invoke("generate-cover", { body: { courseId: course.id, type: "course" } })`, обновить локально + `onCourseUpdated?.()`, тост «Генерируем…» / «Готово». Состояние `isGeneratingCover` блокирует пункт.
5. Разделитель.
6. **Удалить курс** (`Trash2`, `text-destructive`) → `h.setShowDeleteConfirm(true)` (диалог уже есть в `useCourseDetails`).

### Реализация
Внутри `CourseDetailsContent.tsx`:
- Локальные `useState` для `isGeneratingCover` и `useRef` для `coverInputRef`.
- Локальные функции `handleCoverUpload(e)` и `handleGenerateCover()` — копия логики из `CoursesTab.tsx` (строки 65–76, 78+), адаптированная под текущий `course.id`.
- Скрытый `<input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handleCoverUpload} />` рядом с баннером.

### Что НЕ трогаем
- Хук `useCourseDetails` — не расширяем (логика короткая, держим в компоненте).
- Карточки курсов в `/organization` (`CourseCardView`) — там меню «...» уже добавлено в прошлой итерации.
- Сайдбар конструктора уроков, модули, диалог удаления — без изменений.
- Edge-функцию `generate-cover` — она уже принимает `type: "course"`.

### Файлы под изменение
- `src/components/organization/CourseDetailsContent.tsx` — заменить блок трёх кнопок на `DropdownMenu` + добавить локальные обработчики обложки и AI-генерации + скрытый file input.

