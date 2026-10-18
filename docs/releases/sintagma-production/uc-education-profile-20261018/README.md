# UC-007 / UC-009 — профиль учебного центра и решения о применимости

Совместный пакет108–109 подготовлен локально и прошёл actual SQL tests. Применение в production выполняет root; этот агент не выполнял никаких производственных записей.

## Границы

- Новый профиль — явное заявление организации. Чтение отсутствующего профиля возвращает revision0 и все неизвестные значения `null`; записи и backfill не создаются.
- Профиль не заполняется из `organizations`, самообследования или имеющихся документов. Пустые массивы означают явно выбранное «нет», `null` — неизвестно.
- Сведения о лицензии — заявление сотрудника с источником, датой и ссылкой на основание. Они не становятся официальной проверкой. URL не запрашивается сервером.
- Основание проверяется по точной организации, документу и версии. Для документа с историей необходимо явно указать версию; прежняя ссылка без версии допускается только для документа без текущей версии. Само наличие ссылки не подтверждает содержание или юридическую достаточность.
- Решение «не применимо» хранится с мотивировкой, версией каталога и снимком профиля. SQL не утверждает юридический результат. Каталог и evaluator определяют актуальность; старое решение не переносится автоматически на новую версию профиля.
- Существующие организации,32 типа документов, файлы, подписи, номера, выдача, журналы и расписания не меняются. UC-010 этим пакетом не закрывается.

## RPC и CAS

`get_organization_education_profile(p_organization_id)` возвращает
`{organization_id,revision,profile,updated_at,updated_by}`.

`save_organization_education_profile(p_organization_id,p_expected_revision,p_profile,p_request_id)`
возвращает такой же снимок. Каждый новый requestId создаёт новую версию, даже при одинаковом содержимом. Повтор того же requestId, актёра, expectedRevision и JSONB возвращает первоначальный сохранённый снимок без изменения текущей версии. После повторной доставки ответа клиент обновляет текущий профиль.

`list_organization_education_profile_history(p_organization_id,p_limit DEFAULT25,p_before_revision DEFAULTNULL)`
возвращает снимки по убыванию revision; limit1–100, исключительная граница beforeRevision.

`list_organization_document_applicability_decisions(p_organization_id)` возвращает последние снимки по каждому requirementId, включая отозванные и устаревшие.

`save_organization_document_applicability_decision(p_organization_id,p_requirement_id,p_expected_revision,p_profile_revision,p_catalog_version,p_decision,p_reason,p_request_id)`
сохраняет декларацию `applicable`/`not_applicable` либо отзыв `NULL`. Причина обязательна и ограничена4000 символами. Требуется существующая текущая версия профиля. Сервер принимает только32 точных ID каталога `uc-requirements-2026-10-18-v1`.

`list_organization_document_applicability_history(p_organization_id,p_requirement_id,p_limit DEFAULT25,p_before_revision DEFAULTNULL)`
возвращает историю с сохранённым `profile_snapshot`.

Ошибки: `42501` — нет полномочий; `40001` — устаревшая версия; `22023` — неверный формат/повтор requestId с изменёнными данными. CAS требует обновления данных, а неопределённый исход запроса — повтора первоначального requestId с первоначальным телом.

## Доступ и сохранность

Все RPC требуют настоящего `auth.uid()` и действующего `uc_document_action_allowed(org,'read'|'write',NULL,NULL)`. Групповые полномочия преподавателя не дают доступ к профилю всей организации. Платформенный viewer может читать, но не изменять; истёкший или отозванный пользователь не получает даже прежний receipt через повторную запись.

Четыре новые таблицы имеют RLS. Прямой INSERT/UPDATE/DELETE закрыт для anon/authenticated/service_role; restrictive read-boundary выдерживает добавление отдельной permissive SELECT policy. История не допускает самостоятельного UPDATE/DELETE; сохранён существующий каскад удаления самой организации, без введения нового срока хранения.

Общий транзакционный advisory lock по организации сериализует изменения профиля и решений. CAS, current snapshot и immutable history записываются атомарно. Действующие полномочия перепроверяются после ожидания lock. Ошибка истории откатывает current snapshot и request receipt. Существующие правила хранения версий документов не ослабляются.

## Проверки

- 38 actual SQL scenarios на PGlite поверх actual100–105 и14 снятых read-only production определений доступа.
- 38 actual SQL scenarios для109: namespace + uploader, роль/группа/tenant, initial staging до parent, коммерческий sender, recipient revision, старые forged references, scan/certificate, finalization, receipt/CAS/replay и поздний rollback.
- 6 actual atomic-batch tests общего108–109: полный выпуск, late109 ledger rollback обеих миграций, source tamper, auth drift, отсутствующая прежняя миграция и повторяемые schema/function fingerprints после пользовательского сохранения.
- Положительные owner/custom writer; отрицательные learner, assigned teacher, viewer, revoked/expired, NULL-auth/service, foreign tenant.
- CAS, idempotent replay, другой актёр/тело, history pagination, отзыв, stale profile/catalog, строгие поля, evidence binding, поздний rollback.
- Реальная двухсессионная конкуренция PostgreSQL не выполнялась: тестовая среда — одна connection. Сериализацию обеспечивают advisory lock, row locks, unique keys и CAS; последовательные stale requests проверены.
- В новом Windows checkout старые fixture read helpers нормализуют CRLF→LF, как released executor. Исходники100–107 не изменены.
- READ-ONLY production preflight проверяет14 access hashes, token helper, file helpers/RPC, приватность signature buckets, owner metadata и8 прежних ledger entries. Это не применение миграции.

## Подготовка выпуска

`prepare-release.mjs` создаёт exact-source manifest, read-only preflight/postcheck и atomic SQL. Он выполняет только локальную PGlite fixture для получения новых function/schema fingerprints, не подключается к production.

Wrapper — одна REPEATABLE READ транзакция, общий release advisory lock и lock ledger, проверка8 прежних исходников, source hash каждой108/109 до EXECUTE, late ledger INSERT, проверка новых schema/function/trigger/policy fingerprints. Preservation проверяет45 прежних таблиц, существующие policies/functions и cron. Только4 проверенных функции изменяются: Storage scope/read/write и сериализация legacy add_signature_revision. Их новые определения проверяются точно, owner/ACL сохраняются. Пять новых таблиц должны оставаться пустыми внутри выпуска; повторяемый postcheck не требует пустоты после реальных пользовательских действий.

Не выполнять historical bulk migrations. При ошибке выполнить ROLLBACK и исследовать причину; не обходить guards и не выдавать дополнительные ACL.

## Привязка файлов подписи и порядок выпуска

1. Выпустить ровно get-signature-file с замороженными transitive dependencies и явным verify_jwt=false. Функция сама проверяет токен через service-only SQL context. До SQL отсутствующая функция закрывает доступ.
2. Выполнить весь release-transaction.sql одним запросом; получить все true postcheck.
3. Выпустить companion UI. Старый flat-upload интерфейс между SQL и UI отказывает безопасно: legacy create RPC создаёт случайный parent, не совпадающий с новым namespace. Не обходить это разрешением старых путей.

Новые файлы: org/signature-files/signatureUUID/fileUUID.ext. UUID подписи известен до upload. Canonical staged object допускает только INSERT; overwrite/delete запрещены ещё до attachment. NEW revision требует эту точную подпись и created_by=auth.uid() с совпадением Storage uploader. Исключение service — только существующее создание HTML-only версии, без file pointer.

create_external_contract_signature_v2 и add_signature_revision_v2 возвращают UUID. Private uc_signature_file_requests хранит SHA256 полного запроса, актёра, signature/revision ID. Повтор с тем же ID/телом возвращает receipt, включая после подписания, без нового документа/версии и без возврата статуса в review. Изменённые данные/expectedRevision с прежним ID отвергаются. Новый revision request требует актуальный parent current revision; commit/history/notification/receipt атомарны. Это не доказательство реальной двухсессионной concurrency — её среда пока не предоставляет.

Token broker принимает только токен, kind и optional exact revision ID; клиент не выбирает bucket/path. SQL подтверждает canonical signature namespace AND uploader, Edge независимо проверяет same-project URL и хеш подписанных bytes, повторяет context и выдаёт60-секундную ссылку. Ни токены, ни содержимое документов не входят в manifest/evidence.

Read-only production inventory до выпуска:1 signature,1 revision с flat file pointer;6 external objects, из них5 flat,0 canonical;1 certificate pointer,0 scan/snapshot pointers. Никакие записи или blobs не мигрируются. Legacy ambiguous source возвращает P0010/HISTORICAL_FILE_BINDING_UNVERIFIED: публичный recipient и assigned teacher не получают доступ из mutable reference. Самостоятельное org-wide право owner/admin/reader сохраняет прежний user-JWT Storage read; UI может использовать его только для этого исторического кода, без обхода revoked/expiry/hash errors.

Manifest хранит canonical LF hashes обеих SQL, всех product UI файлов, config и полного локального import graph Edge. На Windows raw CRLF hash может отличаться: перед сравнением нормализуется только CRLF→LF.

