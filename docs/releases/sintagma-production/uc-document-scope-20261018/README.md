# UC-003: второй технический выпуск

Подготовленный пакет содержит только104–107. Foundation100–103 уже должен присутствовать в точном migration ledger. Этот каталог и `preparedOnly` в manifest не являются подтверждением production deployment.

1.104 — явные назначения преподавателей группам, read/Storage scope, защита источников журналов и договоров. Ноль назначений означает отсутствие общего преподавательского доступа. Собственные ученические данные сохранены.
2.105 — отдельные `documents.sign`/`documents.issue`, guards операций и защита readonly администратора платформы. JSON прав существующих сотрудников не переписывается.
3.106 — передача сохранения DOCX-пакета исходному пользователю с проверкой группы и отдельным подтверждением подготовленных сервером данных.
4.107 — обратимая приостановка одного проверенного legacy reminder cron через `cron.alter_job`. Команда, расписание, остальные задания не изменяются. Secure system reminders/retention требуют отдельной реализации.

## Порядок

Сначала развернуть только перечисленные в manifest companion Edge вместе с локальными зависимостями. Новые проверки должны отказывать безопасно, пока SQL не установлен. Затем отправить **весь `release-transaction.sql` одним запросом**, после чего развернуть companion UI и проверить штатные сценарии.

Wrapper использует REPEATABLE READ, общий advisory lock и блокировку ledger. Каждый исходный migration проверяется по hash, выполняется без внутреннего BEGIN/COMMIT, записывается в ledger точным текстом. Внешняя транзакция сохраняет исходные строки перечисленных таблиц, старые restrictive policies и cron metadata; исключение разрешено только для active целевого reminder job. После ошибки весь пакет откатывается. Повтор успешного пакета запрещён preflight. Файлы, номера, подписи, исторические права и учебные результаты не переписываются.

`preflight.sql` и `postcheck.sql` — только SELECT metadata. Postcheck можно повторять после рабочих операций; нулевые назначения/stages проверяются только внутри установки. SQL не назначает группы автоматически и не вызывает выдачу документов, подпись, отправку или генерацию номера.

## Компилятор

После успешных загрузок Edge вызывает через service client:

```
register_goreltech_group_document_stage(p_actor_id,p_organization_id,p_group_id,p_docs)
```

Он связывает canonical JSONB hash с actor/org/group на15минут. Таблица недоступна браузеру и service direct DML. Поля файлов/шаблонов рассчитывает и проверяет доверенный компилятор; SQL не утверждает, что сам прочитал байты файла. Повтор не оживляет истёкшую или использованную stage.

Затем original-user client вызывает прежний `create_goreltech_group_document_batch` либо его `_once` вариант. Caller должен совпасть с actor и иметь `documents.write` в точной группе. Base consumes stage в той же транзакции, что9черновиков. `_once` сохраняет receipt по operation ID; повтор от того же актуально авторизованного actor возвращает прежнюю receipt. Никаких официальных номеров/образовательных фактов этот путь не создаёт. Старые service-only commit вызовы после106 запрещены; generic fallback нет.

## Приёмка и ограничения

Actual SQL: scope27проверок, compiler7, release batch6. Последний suite включает полный исходный batch, точные ledger/dependency hashes, all-or-nothing rollback, policy/view drift, отказ при неизвестном cron hash и non-superuser deployment с SELECT-only cron table. Fixture использует синтетическую команду без credential; заменяет только opaque command hash и соответствующие source/executable hashes107. Production command/токен в тесты не копируется.

PGlite выполняет реальные SQL и CAS/locking statements, но это одна сессия: параллельные PostgreSQL гонки не заявлены как проверенные. Необходимо проверить штатно owner writer, assigned teacher, unassigned teacher, learner own files, viewer readonly; не изменять production данные для искусственной демонстрации.

Read-only impact preflight выявил1активного ограничиваемого преподавателя. После deploy владелец выбирает реальные группы через «Сотрудники» и проверяет их доступ. Пока назначения и реальный сценарий не выполнены, teacher workflow не считается принят.

Для регенерации: `node docs/releases/sintagma-production/uc-document-scope-20261018/prepare-release.mjs`. Generator только читает/пишет локальные артефакты, не подключается к production. После любых source/Edge edits регенерировать и повторить release suite.
