
## Что делаем

### 1. Вкладка «Группы» — первая и по умолчанию
В `StudentsTab.tsx` панель-переключатель сейчас: Активные → Архив → Группы. Меняем порядок на: **Группы → Активные → Архив**. Значение по умолчанию `panelMode` меняем с `"active"` на `"groups"` (запоминаем последний выбор пользователя в `localStorage['orgStudentsPanelMode']`, чтобы кто уже привык к «Активным» — не терял состояние).

### 2. URL-навигация в папке группы (Back/Forward/Reload)
Сейчас `selectedGroupId` живёт только в React-state (`useTabNavigation`), а внутри `GroupFolderTab` открытая под-папка (`openFolder`: contracts/passports/snils/exams/docs) — в локальном `useState`. При перезагрузке всё теряется, кнопки «Назад»/«Вперёд» в браузере ведут не туда.

Правки:
- **`useTabNavigation.ts`**: `selectedGroupId` синхронизировать с query-параметром `groupId` (по аналогии с `courseId`/`studentId`). Добавить `openGroupFolder(groupId)` — атомарно ставит `tab=group-folder&groupId=…`. При переходе на другие табы — очищать `groupId` (по правилам, аналогичным `courseId`).
- **`TabContentRenderer`** и место открытия папки из `StudentsTab.tsx` (строка 228) переключить на `openGroupFolder(group.id)`.
- **`GroupFolderTab.tsx`**: `openFolder` тоже вынести в URL — новый query `folder` (значения `contracts|passports|snils|exams|docs`). Читать/писать через `useSearchParams`. Кнопки «К папкам» / «Назад» использовать `navigate(-1)` там, где логично, и `setSearchParams` для очистки `folder`.
- В `GroupFolderTab` брать `groupId` из URL (fallback на проп) — чтобы прямая ссылка `?tab=group-folder&groupId=…&folder=contracts` открывала нужное состояние после reload.

### 3. Единая кнопка «Действие» внутри папок
Сейчас в `ContractsFolder.tsx` три отдельные кнопки: «Сгенерировать договор», «Загрузить готовый», «Загрузить шаблон». Заменяем на один `DropdownMenu` **«+ Действие»** (primary-btn) с пунктами:
- 📝 Сгенерировать договор (мастер)
- ⬆️ Загрузить готовый договор (файл PDF/DOCX)
- 🪄 Загрузить шаблон .docx (AI-разметка переменных)

Тот же паттерн подготовим для остальных папок по мере их доработки (passports/snils/exams — сейчас read-only; для них появится «Действие» с «Загрузить файл» / «Распознать OCR» — но это следующим этапом; сейчас в этих папках оставляем текущий вид без кнопки).

### 4. Хлебные крошки и «Назад»
Хлебные крошки в `GroupFolderTab` («Ученики / Группы / <имя>») делаем кликабельными и через `openGroupFolder`/`setActiveTab("students")` + сохраняем `panelMode=groups` (через тот же URL-параметр, чтобы возврат приводил именно во вкладку «Группы», а не в «Активные»). Для этого `panelMode` тоже переносим в URL как `studentsView=groups|active|archive` (default = groups).

## Технические детали

Файлы:
- `src/hooks/useTabNavigation.ts` — добавить `selectedGroupId` из URL, `openGroupFolder`, очищать `groupId`/`folder` при смене таба.
- `src/components/organization/tabs/StudentsTab.tsx` — порядок табов, URL-параметр `studentsView`, вызов `openGroupFolder`.
- `src/components/organization/tabs/GroupFolderTab.tsx` — `folder` через `useSearchParams`, кликабельные хлебные крошки.
- `src/components/organization/group-folder/ContractsFolder.tsx` — 3 кнопки → `DropdownMenu` «Действие» (используем существующий `DropdownMenu` из `@/components/ui/dropdown-menu`).

Ничего в бэкенде не трогаем — правки чисто фронтовые (URL/UI). Никаких данных не мигрируем.

## Что НЕ входит

- Функционал внутри папок Паспорта/СНИЛС/Экзамены/Документы группы (там пока read-only заглушки — доработаем отдельно, как и обещали пользователю).
- Мобильная навигация не меняется (табы в мобильном меню продолжают работать через тот же `setActiveTab`).
