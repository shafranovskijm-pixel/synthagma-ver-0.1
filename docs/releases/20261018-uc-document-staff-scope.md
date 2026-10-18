# UC-003: область документов преподавателя

Миграция `20261018104000_uc_document_staff_scope.sql` — второй этап после foundation100–103. Применять вместе с105 (действия read/write/sign/issue), после общего review и атомарной проверки пакета. Этот документ не подтверждает применение в production.

## Контракт UI

`get_org_staff_document_scope(p_organization_id uuid,p_staff_id uuid)` возвращает `staff_id`, `organization_id`, `revision`, `scope` (`organization` или `assigned_groups`), отсортированные `group_ids` и `available_groups:[{id,name}]`. Сотрудник может читать собственное активное назначение; управляющий с `staff.read` или `staff.write` видит доступные группы организации, без списка учеников. Отсутствующее назначение имеет revision0 и пустой массив.

`set_org_staff_document_groups(p_organization_id uuid,p_staff_id uuid,p_group_ids uuid[],p_expected_revision bigint)` требует `staff.write`, активного вызывающего и разрешённой роли администратора платформы. Чужие группы/сотрудник:42501; некорректные аргументы:22023; устаревшая revision:40001. При40001 UI перечитывает назначение. Повтор того же набора с текущей revision не создаёт событие. Изменение набора, revision и событие аудита сохраняются одной транзакцией. Никаких автоматически выведенных назначений нет.

## Серверная область

Преподаватель без назначений не получает общие документы и чужие учебные факты. Владелец организации, активный сотрудник с иной ролью и администратор сохраняют прежнюю организационную область. Права действий отдельно проверяет105. `visibility` сотрудника не используется как ACL.

`uc_document_scope_allowed(org,group,enrollment)` проверяет каждый переданный идентификатор и их совместимость. Когда переданы group и enrollment, должны совпасть организация, единственный курс группы, курс зачисления и effective membership ученика. Membership ученика не является назначением преподавателю. В production проверена одно-курсовая модель `student_groups.course_id`; отдельной связи group_courses не обнаружено.

Собственный ученический профиль, попытки и документы сохраняются, включая двойную роль преподаватель+ученик. Оба effective membership view должны оставаться `security_invoker=true`: миграция откажет при расхождении. Строгая provenance подписи отделена от собственного доступа получателя. `uc_document_signature_source_scope(org,document)` пригоден для проверки NEW.document_id до INSERT; доступ получателя не даёт организационное право подписывать/изменять документ.

Чтение ограничивается на документных таблицах, источниках ученических данных и соответствующих SECURITY DEFINER RPC. Существующие tenant/account-deletion политики сохраняются. Организационные KPI/ФРДО/recycle RPC для ограниченного преподавателя возвращают42501; UI показывает переход к назначенным группам, а не фиктивные нули.

Storage использует точные существующие пути и provenance. Разрешены staging layouts `organizations/{org}/group-documents/{group}/...` и `{org}/contracts/{group}/{job}/{file}` в назначенной группе. DOCX contract читается по точному org_contracts.file_path/docx_path/pdf_path. Непривязанный общий blob не становится групповым по имени или uploader. Перемещения/удаления файлов нет.

## Проверка и выпуск

Actual SQL suite `supabase/functions/_shared/uc-document-scope.sql.test.ts`:27проверок, включая поздний rollback миграции, CAS, multi-org staff, teacher+learner, дополнительные memberships, оба view, вложенные paginated RPC, journal marks, чужую provenance, HTML/roster договоров и Storage.

PGlite выполняет SQL и проверки блокировок в одной сессии. Это не доказательство двухсессионной гонки; настоящий PostgreSQL concurrency smoke остаётся отдельной проверкой выпуска.

Read-only production preflight18октября выявил1активного преподавателя после исключений owner/admin/иной active staff role, у которого существующий общий доступ будет ограничен. Идентификаторы в локальном evidence хешированы. Массового назначения нет. После выпуска владелец должен открыть «Сотрудники», выбрать реальные группы этого преподавателя, сохранить и проверить чтение группы/ученика/файла. Пока этого не сделано, production teacher workflow не считается принятым.

Baseline metadata лежит в `supabase/tests/fixtures/uc-document-*-baseline.json` и `uc-org-contracts-baseline.json`; локальные безопасные counts/hashes — в рабочем `work/uc-release-20261018`. Исторические документы, брендинг и ученические результаты миграцией не изменяются.
