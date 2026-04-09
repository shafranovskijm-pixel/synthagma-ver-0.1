
Цель: исправить не “рендер” курса, а сам импорт — сейчас парсер по факту логинится в пользовательскую сессию, поэтому видит только 6 доступных уроков и не имеет доступа к содержимому.

Что уже подтверждено
- В логах функции:
  - `/api/rest/school/course/{id}` → 401
  - `/api/rest/school/course/{id}/step/list` → 401
  - `/api/rest/student/course/{id}` → 200
  - `/api/rest/student/lesson/{id}` → 403
- Значит проблема не в базе и не в UI:
  - создаются только 6 уроков из student flow
  - контент не тянется вообще
- Дополнительно видно, что текущий импорт сохраняет HTML-строку в `lessons.content`, а редактор/просмотр курса в проекте в основном ожидают JSON-массив блоков. Это отдельное улучшение, которое стоит сделать сразу.

Что нужно изменить

1. Починить авторизацию SkillSpace в функции
- Переработать блок логина в `supabase/functions/parse-skillspace-course/index.ts`
- Вместо текущего `headers.getSetCookie?.()` сделать надёжный сбор cookie из ответа авторизации:
  - читать все `set-cookie`
  - склеивать только cookie-пары `name=value`
  - при необходимости пройти follow-up запрос после 302/redirect, чтобы получить полную school-сессию
- Добавить явную валидацию после логина:
  - если `/api/rest/school/course/{id}` всё ещё даёт 401, не падать обратно в “успешный” student-import
  - вернуть понятную ошибку: что вход выполнен, но school/admin API недоступен для этой сессии

2. Убрать ложный fallback, который маскирует проблему
- Сейчас функция тихо переключается на student API и создаёт “обрезанный” курс на 6 уроков
- Изменить логику так:
  - если пользователь хотел owner/admin-импорт, а school API недоступен — завершать импорт ошибкой
  - fallback на student API оставлять только как явно контролируемый резервный режим, а не как автоматический “успех”

3. Сохранять контент в формате, совместимом с редактором проекта
- Сейчас функция конвертирует EditorJS → HTML и пишет HTML в `lessons.content`
- Но в проекте:
  - `jsonToBlocks()` ожидает JSON блоков
  - `parseContentToBlocks()` для учебного просмотра принимает только JSON-массив блоков
- Поэтому в функции нужно сохранять не HTML, а JSON блоки вашего редактора:
  - `header` → `heading1/heading2`
  - `paragraph` → `paragraph`
  - `list/nestedList` → `bulletList/numberedList`
  - `quote` → `quote`
  - `image` → `image`
  - `delimiter` → `divider`
- Если часть блоков не поддерживается, складывать их в `paragraph`/placeholder, но всё равно формировать валидный JSON-массив

4. Улучшить извлечение страниц урока
- В `lesson/{uuid}` пройтись по `pagesPublished`
- Для каждой страницы:
  - учитывать `title`
  - извлекать `content.blocks`
  - объединять в единый набор блоков урока
- Если страница пустая, не считать её содержимым
- Если урок реально недоступен — логировать отдельно как access error

5. Сделать честную статистику результата импорта
- Сейчас успех выглядит как “6 уроков, 0 с контентом”, что технически не объясняет корень проблемы
- Вернуть в ответ:
  - режим импорта: `school` или `student`
  - доступно ли school API
  - число уроков, найденных через school API
  - число уроков, где реально извлечены блоки
  - число уроков, пропущенных из-за доступа
- В `SkillspaceImportDialog` показать предупреждение, если импорт был fallback/partial, а не полноценный

Файлы
- `supabase/functions/parse-skillspace-course/index.ts` — основное исправление
- `src/components/admin/SkillspaceImportDialog.tsx` — улучшение статуса результата и ошибок

Техническая причина
- Текущая версия функции не удерживает полноценную school/admin cookie-сессию после логина, поэтому все `/api/rest/school/*` запросы идут как неавторизованные
- Из-за этого срабатывает student fallback, который видит только 6 уроков из доступного потока
- Даже если бы контент частично пришёл, сейчас он сохраняется в HTML, а приложение в основном работает с JSON-блоками, так что импорт лучше сразу привести к родному формату проекта

Ожидаемый результат после правки
- Если owner/admin-доступ действительно есть:
  - импортируются все уроки курса, а не только 6
  - в уроках появляется реальный контент
  - курс открывается в редакторе и просмотре без потери содержимого
- Если school API недоступен:
  - система честно сообщает об этом и не создаёт “пустой успешный импорт”

<lov-actions>
<lov-suggestion message="Test the SkillSpace import end-to-end again after the parser auth flow is fixed, and verify that all lessons and their content appear in the imported course.">Verify that it works</lov-suggestion>
<lov-suggestion message="Implement the SkillSpace parser fix now: repair auth cookie handling for school/admin API, disable misleading student fallback, store imported lesson content as the app’s native JSON blocks, and improve partial import error messages in the dialog.">Fix SkillSpace Import</lov-suggestion>
<lov-suggestion message="Add an import debug panel in the admin dialog that can expand to show parser logs, import mode, found lessons, inaccessible lessons, and the first few API statuses after each import attempt.">Add Import Debug Panel</lov-suggestion>
<lov-suggestion message="Add a preview action after import that opens the first imported lesson directly so I can instantly check whether content was parsed correctly.">Open First Imported Lesson</lov-suggestion>
</lov-actions>
