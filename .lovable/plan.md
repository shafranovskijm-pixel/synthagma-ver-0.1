
## Проблемы, которые правим

1. **Ошибка «violates foreign key … template_id_fkey»** при сохранении шаблона.
   Причина: триггер `snapshot_contract_template_version` работает `BEFORE INSERT` и пишет запись в `org_contract_template_versions` до того, как строка в `org_contract_templates` реально появилась → нарушение FK.

2. **Шаг 3 «Проверка» не видно / нельзя пролистать** в диалоге загрузки шаблона — область просмотра растягивает диалог за пределы окна, нет корректного скролла.

3. В генераторе договоров нет управления **номером договора** (только ручной ввод).

4. В шаблоне ГОРЭЛТЕХ есть места под **список обучающихся** и **программу/учебный план**, но AI-квиз их проигнорировал, а UI не даёт их заполнить.

5. Нет места для хранения **учебного плана программы** и способа подтянуть его в договор.

---

## Что сделаем

### 1. Миграция БД

- Разделяем триггер снапшота на два:
  - `BEFORE INSERT/UPDATE` — только считает и проставляет `NEW.version` (без записи в versions).
  - `AFTER INSERT/UPDATE` — пишет строку в `org_contract_template_versions` (FK теперь валиден, т.к. родительская строка уже есть).
- Новая таблица `program_training_plans` (или поле `training_plan_html` в `courses`), в которой хранится учебный план программы (rich text/HTML), + GRANT + RLS «члены организации управляют своими».
- Новая таблица `org_document_number_settings` (org_id, doc_type, mode `auto|prefix|none`, prefix, next_number, year_reset bool) для авто-нумерации договоров (используем существующий подход, если уже есть — переиспользуем `document_number_sequences`).

### 2. Загрузка шаблона (`UploadTemplateDialog.tsx`)

- Каркас `DialogContent` → `flex flex-col min-h-0`, каждая секция шага в `flex-1 min-h-0 overflow-hidden`; `ScrollArea` на шагах 2 и 3 получает явную высоту → шаг «Проверка» становится скроллируемым и виден целиком.
- В детекторе слотов добавляем распознавание **табличных «дыр»** (пустые `<td></td>` в подряд идущих строках таблицы) → отдельный тип слота `table_students` / `table_programs`, чтобы AI мог их сопоставить с ключами `{{students_table}}` и `{{programs_table}}`.
- Каталог переменных расширяем ключами: `students_table`, `students_count`, `program_title`, `program_hours`, `program_form`, `training_plan`, `contract_city`.

### 3. Каталог переменных / рендер (`templateRenderer.ts`, `contractTemplateHelpers.ts`)

- `{{students_table}}` — при рендере подставляем HTML-таблицу (№, ФИО, образование, телефон/e-mail, должность, адрес, программа) по выбранным ученикам.
- `{{programs_table}}` — таблица «программа / форма / кол-во человек».
- `{{training_plan}}` — HTML учебного плана выбранной программы.

### 4. Диалог генерации (`GenerateContractDialog.tsx`)

- Секция **«Номер договора»** — три режима:
  - `Автоматически` (берёт следующий номер из sequence с настройками префикса/сброса по году),
  - `Свой префикс от ___` (пользователь задаёт стартовый номер и префикс, сохраняется в настройках),
  - `Без номера` (в переменную идёт пустая строка / прочерк).
- Секция **«Обучающиеся»**:
  - выбор существующих учеников группы (мультивыбор чекбоксами);
  - inline-форма «Добавить нового ученика» (ФИО, e-mail, телефон, должность, образование) — создаёт `profiles`+`enrollments` через существующий edge `register-student` и сразу добавляет в группу;
  - выбранные ученики формируют `{{students_table}}` и `{{students_count}}`.
- Секция **«Программа обучения»**:
  - выбор из существующих курсов организации (`courses` + `program_documents` при наличии);
  - поле «Форма обучения», «Кол-во часов» подтягиваются из курса, редактируемо;
  - кнопка **«Учебный план»** открывает мини-редактор (rich text) → сохраняется в `program_training_plans` для этой программы и подставляется как `{{training_plan}}`.

### 5. Обновления UI

- В `ContractsFolder.tsx` подпись кнопки остаётся «Загрузить шаблон», порядок как сейчас.
- В генераторе после выбора программы появляется бейдж «Учебный план: задан / не задан» с быстрым переходом к редактору.

---

## Технические детали

- Файлы:
  - `supabase/migrations/*` — split trigger + `program_training_plans` + опциональные настройки нумерации.
  - `src/lib/contractTemplateImport.ts` — детект табличных пустых строк, новые hint-правила.
  - `src/components/organization/group-folder/UploadTemplateDialog.tsx` — layout `flex min-h-0`, скролл шага 3, расширенный каталог.
  - `src/lib/templateRenderer.ts` — рендер `{{students_table}}`, `{{programs_table}}`, `{{training_plan}}`.
  - `src/components/organization/group-folder/GenerateContractDialog.tsx` — блок номера, мультивыбор + inline-создание учеников, выбор программы + редактор учебного плана.
  - Новый `src/components/organization/group-folder/TrainingPlanEditor.tsx` (rich text через существующий `BlockEditor`/textarea+preview).
  - Новый хук `src/hooks/useContractNumberSequence.ts` (get-next + сохранение настроек).
- Триггер: `BEFORE` — только `NEW.version := next`; `AFTER` — `INSERT INTO org_contract_template_versions`. Старый триггер удаляем.
- Учебный план хранится как HTML per-course (`course_id UNIQUE`), доступ по RLS `has_org_staff_permission('courses.view'/'manage')`.

---

## Что НЕ меняем в этой итерации

- Общий вид карточки папки «Договоры» и таблицы договоров.
- Механику отправки на подписание (`document_signatures`).
- Существующие шаблоны — они продолжат работать; новые ключи опциональны.
