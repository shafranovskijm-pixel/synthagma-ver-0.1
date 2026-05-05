## Что нужно

1. Для **новых организаций** по умолчанию показывать «вид папками» (а не плоский список).
2. После «Добавить из магазина» курс должен сразу появляться в списке курсов организации — **без Ctrl+Shift+R**.

## Что сделаю

### 1. Дефолт «папки» для новых организаций

`src/hooks/useDashboardSettings.ts`:
- `defaultMenuSettings.courseFolderMode` = `'folders'` (уже так — оставляем).
- `normalizeMenuSettings`: для новых орг (когда в `menu_settings` ещё нет `courseFolderMode`) возвращать `'folders'`. Сейчас уже так. Проверю, что `defaultMenuSettings` действительно подхватывается на первом рендере.
- Главная правка: убрать «временный» дефолт `courseViewMode='list'` который мог проскочить в `useCourses.ts` и т.п. → принудительно начинать с `grid + folders` до прихода БД-настроек.

`src/components/organization/tabs/CoursesTab.tsx` (строки 141–151):
- Инициализация `folderViewMode` уже `"folders"` если `menuSettings` пуст. Подтвердить что для новой org реально `menu_settings` либо пуст, либо содержит `folders`. По данным в БД у новой `ВТОРОЙ` уже стоит `flat` (видимо был ручной клик). Нужно гарантировать, что **триггер создания организации** записывает `courseFolderMode: 'folders'` по умолчанию — добавлю миграцию: при `INSERT` в `organizations`, если `menu_settings` пуст, заполнять дефолтами с `courseFolderMode='folders', courseViewMode='grid'`.

### 2. Авто-обновление списка курсов после покупки в магазине

`src/hooks/useCourseStoreManager.ts` (`handleOrder`, после клонирования курса):
- После успешного клонирования вызвать `window.dispatchEvent(new CustomEvent('org-courses-refresh', { detail: { organizationId } }))`.

`src/components/organization/tabs/CoursesTab.tsx` (или внутри `useCourses.ts`):
- Подписаться на `org-courses-refresh` и вызывать `refresh()` (он уже экспортирован из `useCourses`) при матче `organizationId`.
- Дополнительно — инвалидировать react-query ключи `['org-core', orgId]` (для лимитов/счётчиков курсов).

### 3. Бонус — лучше UX после заказа

В `CourseStoreManager` после `setShowSuccessDialog(true)` показать кнопку «Перейти к курсам», которая переключает таб на `"courses"`. Это даст мгновенную обратную связь и сразу покажет добавленный курс (уже с обновлённым списком благодаря пункту 2).

## Файлы

- `src/hooks/useDashboardSettings.ts` — гарантировать дефолт `folders` при отсутствии настроек в БД.
- `supabase/migrations/...` — миграция: триггер `BEFORE INSERT` на `organizations`, заполняющий `menu_settings` дефолтами если NULL/пусто.
- `src/hooks/useCourseStoreManager.ts` — диспатч события `org-courses-refresh` после клонирования.
- `src/components/organization/tabs/CoursesTab.tsx` — слушатель события + вызов `refresh()`, кнопка «Перейти к курсам» в `SuccessDialog` (через колбэк).
- `src/components/organization/CourseStoreDialogs.tsx` (Success dialog) — добавить кнопку.

После применения: новые организации сразу видят «папки», а после «Добавить из магазина» курс появляется в списке без ручной перезагрузки.
