
## Что делаем

В папке «Договоры» внутри группы (`GroupFolderTab`) добавляем полный цикл работы с договорами по ученикам:
1. Загрузка готового PDF/DOCX.
2. Генерация договора из шаблона организации (`org_contract_templates`) — с выбором типа контрагента (физ. лицо / юр. лицо).
3. Добавление нового шаблона прямо из папки — система автоматически находит переменные `{{...}}` в теле и предлагает заполнить недостающие.

Используем то, что уже есть в проекте, ничего не дублируем:
- Хук `useOrgContractTemplates` (`src/hooks/useOrgContracts.ts`) — CRUD шаблонов.
- `src/lib/templateRenderer.ts` — `renderTemplate`, `extractVariables`, `findMissingVariables`, `buildOrgVariables`, `buildCompanyVariables`, `wrapAsPrintableDocument`.
- `src/components/organization/contract-template/contractTemplateHelpers.ts` + `variableCategories.ts` — каталог переменных (ученик, организация, компания, договор).
- Редактор шаблона `ContractTemplateEditor` (открытие по ссылке на вкладку `contract-editor`).
- Существующая логика массовой генерации в `BulkDocumentGenerator.tsx` — из неё берём паттерн: рендер HTML → PDF через edge-функцию `html-to-pdf` → сохранение файла в bucket `billing-documents` → запись в `org_contracts`.

## Что нужно добавить в БД

Таблица `org_contracts` сейчас хранит только `organization_id, name, contract_number, contract_date, file_url, file_path, status`. Для «договоров по ученикам группы» и юр.лицам не хватает связей — GroupFolderTab уже пытается фильтровать по `student_user_id`, но такой колонки нет (запрос молча возвращает 0).

Миграция:
- `ALTER TABLE public.org_contracts` — добавить:
  - `student_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL`
  - `student_group_id UUID REFERENCES public.student_groups(id) ON DELETE SET NULL`
  - `company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL` (для юр.лица; таблицу `companies` использует существующий BulkDocumentGenerator)
  - `counterparty_type TEXT CHECK (counterparty_type IN ('individual','legal'))`
  - `template_id UUID REFERENCES public.org_contract_templates(id) ON DELETE SET NULL`
  - `variables JSONB DEFAULT '{}'::jsonb` (снимок значений переменных на момент генерации — для повторного скачивания)
- Индексы: `(organization_id, student_group_id)`, `(organization_id, student_user_id)`.
- Существующие RLS-политики уже позволяют членам организации CRUD — новые колонки автоматически покрываются.

## UI: диалоги в папке «Договоры»

Новый компонент `src/components/organization/group-folder/ContractsFolder.tsx` рендерится, когда `openFolder === "contracts"`. Список договоров по ученикам группы (с фильтром/поиском) + кнопки:

1. **«Загрузить договор»** — файл-инпут (`.pdf`, `.doc`, `.docx`). Диалог: выбрать ученика группы, тип (физ/юр), номер и дату. Загружаем в bucket `billing-documents` по пути `<orgId>/contracts/<groupId>/<studentId>/<uuid>.<ext>`, создаём запись в `org_contracts`.

2. **«Сгенерировать по шаблону»** → диалог `GenerateContractDialog.tsx`:
   - Шаг 1: тип контрагента — **Физическое лицо** (ученик группы) / **Юридическое лицо** (компания из `companies`).
   - Шаг 2: выбор шаблона из `org_contract_templates` (кнопка «Открыть редактор шаблонов» ведёт на `contract-editor`, кнопка «➕ Новый шаблон» открывает мини-редактор).
   - Шаг 3: выбор получателя — ученик группы (мультиселект для физ.) или компания (селект + автоподгрузка реквизитов).
   - Шаг 4: предпросмотр — рендерим `renderTemplate(body_html, vars)` в iframe. Через `findMissingVariables` подсвечиваем пустые поля и даём инпуты для ручного ввода (`contract_number`, `contract_date`, `contract_sum` и любые кастомные). Переменные тянем из тех же билдеров, что использует `BulkDocumentGenerator`.
   - Шаг 5: генерация — вызов edge-функции `html-to-pdf` (уже развёрнута), сохранение записи в `org_contracts` (со снимком переменных и `template_id`). Прогресс + результаты (успех/ошибка на ученика).

3. **«➕ Новый шаблон»** — компактный диалог `NewTemplateDialog.tsx`: имя + rich-textarea для HTML. По кнопке «Найти переменные» вызываем `extractVariables()` и выводим список найденных `{{key}}` с чекбоксами «известная / кастомная». Сохраняем через `useOrgContractTemplates().upsert`. Для полноценного редактирования шапка диалога даёт ссылку «Открыть в полном редакторе» → `ContractTemplateEditor`.

## UI: карточки договоров в списке

Каждая запись `org_contracts` — строка с:
- ФИО ученика (или название компании),
- номер/дата договора,
- бейдж типа (физ/юр),
- кнопки: «Скачать» (signed URL, `openPrivateFile`), «Перегенерировать» (если есть `template_id` + `variables`), «Удалить».

## Технические детали

- Signed URL для скачивания — 1 час, через `supabase.storage.from('billing-documents').createSignedUrl`.
- Все значения переменных экранируются в `renderTemplate` по умолчанию (защита от XSS).
- Для юр.лица подтягиваем реквизиты через `buildCompanyVariables(company)`, для физ.лица — минимальный набор из профиля (ФИО, email, паспорт/СНИЛС из `student_identity_documents`, если есть).
- Никаких изменений в существующем `ContractTemplateEditor` и `BulkDocumentGenerator` — только переиспользуем.

## Файлы

Создать:
- `supabase/migrations/<ts>_org_contracts_student_link.sql`
- `src/components/organization/group-folder/ContractsFolder.tsx`
- `src/components/organization/group-folder/GenerateContractDialog.tsx`
- `src/components/organization/group-folder/NewTemplateDialog.tsx`
- `src/components/organization/group-folder/UploadContractDialog.tsx`
- `src/hooks/useGroupContracts.ts` (список договоров по группе + realtime)

Изменить:
- `src/components/organization/tabs/GroupFolderTab.tsx` — рендерить `ContractsFolder` в состоянии `openFolder === "contracts"` вместо текущей заглушки; учесть, что запрос по `student_user_id` теперь реально работает.

## Открытые вопросы

1. При генерации сразу класть договор в `org_contracts` **и** отправлять на подпись через `org_contract_signatures` (тот же поток, что в CRM), или пока только генерировать и хранить файл? По умолчанию сделаю только генерацию/хранение — подпись отдельной кнопкой в записи.
2. Для юр.лица привязка нужна к `companies` (как в CRM) или к произвольному контрагенту с ручным вводом реквизитов? По умолчанию — `companies` + опция «Ввести реквизиты вручную».
