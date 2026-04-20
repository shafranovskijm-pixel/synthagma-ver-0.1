
## Проблема
Сейчас в `CoursesTab` вид курсов берётся не из настройки организации, а из локального `localStorage` (`org-courses-view:${organizationId}`). Поэтому:
- у сотрудника может открываться старый `list`, даже если у организации уже выставлен `grid`
- изменение организационной настройки не подхватывается как источник истины
- уже существующий realtime в `useDashboardSettings` не влияет на `CoursesTab`, потому что таб читает локальное состояние только один раз

## Что исправить

### 1. Сделать настройку организации главным источником
В `src/components/organization/tabs/CoursesTab.tsx`:
- убрать приоритет `localStorage` над `menu_settings.courseViewMode/courseFolderMode`
- при первом открытии брать вид из `dashboard.dashboardSettings.menuSettings`
- если у организации стоит `grid`, страница должна сразу открываться сеткой

### 2. Подхватывать изменения без Ctrl+Shift+R
`useDashboardSettings.ts` уже подписан на realtime по `organizations.menu_settings`.
Нужно в `CoursesTab`:
- синхронизировать `viewMode` и `folderViewMode` с `dashboard.dashboardSettings.menuSettings`
- обновлять UI не только на первом mount, а и при изменении `menu_settings` в рантайме

### 3. Убрать конфликт со старым локальным кэшем
Старый ключ `org-courses-view:${organizationId}` сейчас ломает поведение.
Нужно:
- либо полностью перестать его читать
- либо использовать только как fallback, если в настройках организации вообще нет `courseViewMode`
- желательно очистить/игнорировать legacy-значение, чтобы старый `list` больше не “залипал”

### 4. Сохранение выбора
Если пользователь вручную переключает вид в тулбаре:
- сохранять новый выбор в `organizations.menu_settings.courseViewMode/courseFolderMode`
- локальный storage можно оставить только как вторичный быстрый кэш, но не как источник истины
- после сохранения все сотрудники должны получать новый вид через уже существующий realtime-механизм

## Файлы
- `src/components/organization/tabs/CoursesTab.tsx` — убрать локальный приоритет, добавить sync от `dashboard.dashboardSettings.menuSettings`
- при необходимости `src/hooks/useDashboardSettings.ts` — проверить, что realtime действительно обновляет `courseViewMode/courseFolderMode` и нормализует их в `grid/folders` по умолчанию

## Ожидаемый результат
- если у организации установлен `grid`, курсы открываются сеткой сразу
- другой сотрудник видит актуальный вид без жёсткой перезагрузки
- старый локальный `list` больше не перебивает организационную настройку
