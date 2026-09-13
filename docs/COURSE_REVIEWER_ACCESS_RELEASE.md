# Выпуск доступа проверяющего к курсу ЦСЗ 178 часов

Дата локальной подготовки: 13.09.2026.

Курс: `7630559a-6caf-42e7-97f9-1cd0e4598c39`.

Учетная запись: существующий пользователь с уникальным идентификатором профиля `license_edu`. Его `auth.uid()` заранее не предполагается и в коде не записан.

Статус: **IMPLEMENTED_LOCALLY_FRONTEND_AND_DB_TESTED_NOT_DEPLOYED**. Миграция не применялась к production, frontend не развертывался, production-грант не создавался, доступ учетной записи и данные рабочего курса не менялись. Изолированный PostgreSQL 18.6 runtime-контракт пройден локально на чистой временной базе; транзакция теста откатилась, сервер остановлен.

Production-база `atxwvjxbqjgkbjlhsdch` подключена к проекту `ORIGINAL SINTAGMA` в Global/Lovable Cloud. Отдельного Supabase-контура и отдельного переключения аккаунта Supabase нет. Текущий Codex-коннектор Lovable открыт в другом рабочем пространстве и не показывает `ORIGINAL SINTAGMA`, однако рабочий браузерный доступ к Global/Lovable Cloud и его SQL editor подтвержден; это штатный маршрут для точечного применения и проверки миграций.

## Реализованная граница доступа

- Авторизация обязательна на `/review/course/:courseId`.
- Доступ разрешает только строка `course_review_grants` для точной пары `course_id + user_id`, с будущим `expires_at` и пустым `revoked_at`.
- Черновик остается `is_published=false`; грант не создает зачисление, роль сотрудника или глобальную роль.
- Клиент получает данные только из `get_course_review_snapshot` и `get_course_review_lesson`.
- Снимок выдает 11 модулей и 35 элементов в порядке модуля, затем элемента. Элементы без модуля идут последними.
- Тесты показывают 67 вопросов и варианты как строки. `correct_answer`, `explanation`, вложенные `isCorrect`, ключи мини-тестов и неподдерживаемые JSON-поля не выдаются.
- JSON-похожее поврежденное содержимое скрывается. Таблицы, слайды, строки, числа и логические поля пересобираются по типам, чтобы вложенный объект не раскрыл ключ и не сломал интерфейс.
- Электронная библиотека показывает только назначенные курсу карточки с `visible_to_students=true`; связанная каноническая карточка дополнительно должна иметь `library_status=active`. `needs_review`, `archive` и скрытые карточки не выдаются.
- В интерфейсе нет отправки письменной работы, начала или отправки теста, фиксации прогресса, зачисления, редактирования и публикации. Переход по структуре, просмотр медиа и внешних ссылок не пишут учебное состояние.

## Локальный PostgreSQL runtime-контракт

Финальный прогон: **PASS**. Доказательство: `work/csz_exact_program_20260913/qa/pg-reviewer-contract-20260913-165734-690/RUN_EVIDENCE.json`, SHA-256 `694b973229753f3011ed6fe3308786744c8c604cf0eb60847bb6df10f4d50374`.

Проверенный SQL:

- миграция `20260913130000_course_scoped_reviewer_access.sql`: `48243275607fc6518bf563b217ea71de47aa3f64a94a7756be7fe82dc26d6f86`;
- контракт `course_reviewer_access_local_contract.sql`: `6f1f537b6868099fab75b06a99fd5f0e8a8256887f06423e92d6ca495799bf0e`;
- базовая fixture `course_reviewer_access_local_base.sql`: `f8c0562a63bedaf8c436c9eb83db452a2e7daf03faeeaa195b9a1764e26a23a7`.

Два предыдущих прогона намеренно сохранены со статусом FAIL: они выявили и позволили исправить только ошибки тестовой fixture — чтение временной таблицы после `SET ROLE` и приоритет оператора при приведении JSON. Рабочая миграция не изменялась после этих двух прогонов и совпадает по хэшу с финальным PASS.

## Идемпотентный lifecycle для `license_edu`

Администраторский RPC сам разрешает ровно одну существующую учетную запись по `profiles.login`, `profiles.email` или `auth.users.email`. Неоднозначный или отсутствующий идентификатор отклоняется. Срок должен быть в будущем и не более 30 дней.

Подготовленный action по умолчанию выполняет только dry-run:

```powershell
node scripts/grant-license-edu-course-review.mjs --expires-at=<ISO_DATE_WITHIN_30_DAYS>
```

После отдельного разрешения на внешний выпуск и входа администратора тот же action запускается с `--execute`. Он требует `SINTAGMA_SUPABASE_URL`, `SINTAGMA_SUPABASE_ANON_KEY` и краткоживущий `SINTAGMA_ADMIN_ACCESS_TOKEN`, вызывает `admin_upsert_course_review_grant` и проверяет возвращенные `course_id`, фактически разрешенный `user_id`, срок и отсутствие отзыва. Повтор с тем же сроком не создает вторую строку.

```powershell
node scripts/grant-license-edu-course-review.mjs --expires-at=<ISO_DATE_WITHIN_30_DAYS> --execute
```

Отзыв также сначала проверяется dry-run и затем выполняется только после разрешения:

```powershell
node scripts/grant-license-edu-course-review.mjs --revoke
node scripts/grant-license-edu-course-review.mjs --revoke --execute
```

Отзыв вызывает `admin_revoke_course_review_grant` для той же точной пары и проверяет заполненный `revoked_at`. Повторный отзыв сохраняет исходное время отзыва.

## Последовательность выпуска и приемки

1. Зафиксировать резервную копию базы, фактический production HEAD и список еще не примененных миграций.
2. Применить `20260913130000_course_scoped_reviewer_access.sql`; сохранить лог и проверить владельца функций, `SECURITY DEFINER`, фиксированный `search_path`, права `EXECUTE`, RLS и отсутствие политик прямого чтения `course_review_grants`.
3. Развернуть frontend с маршрутом `/review/course/:courseId`; сохранить commit и deployment ID.
4. До выдачи гранта завершить библиотечный sync. Текущий live-readback содержит 2 активные карточки из 8; скрытые и `needs_review` останутся невидимы проверяющему. Обязательный проект ДПП должен быть доступен по указанному в плане URL, иметь 463619 байт и SHA-256 `884bf08f907b188a4000809e0dbe719f60106a4c7d4ff20b9557e4a5d75cdbc2`, после чего его карточка переводится в `active`.
5. Выполнить dry-run гранта, проверить точные course/login/expiry, затем выполнить action из авторизованной сессии администратора и сохранить возвращенный фактический `user_id`.
6. В отдельной сессии `license_edu` открыть `/review/course/7630559a-6caf-42e7-97f9-1cd0e4598c39` и проверить: черновик; 178 часов; 11 модулей; 35 элементов; 12 письменных заданий; 12 тестов; 67 вопросов; правильный порядок; весь учебный текст; вопросы и варианты без ключей; активную видимую библиотеку; скачивание точного проекта ДПП.
7. До и после прохода сравнить `courses.is_published`, `enrollments`, `lesson_progress`, `test_attempts` и `homework_submissions`. Ожидается `is_published=false` и нулевое изменение четырех наборов учебного состояния.
8. Проверить одинаковый отказ для отсутствующего, чужого, истекшего и отозванного гранта, а также отказ для другого course ID.
9. После окончания проверки выполнить и проверить revoke action.

## Зафиксированные входные материалы LMS

- `LMS_LIBRARY_PAYLOAD_20260913.json`: `ea3e6dd7e1619abe35aa87a0d11c10819198ce38b99867e797605b934671d3d7`.
- `LMS_REVIEWABLE_EXTERNAL_CHANGE_PLAN_20260913.json`: `81c36925d1795ff4258cd931ee9ce6c959d2d192e73b16367d2e2970030e153e`.
- `LMS_FINAL_CHANGE_PLAN_20260913.md`: `39dc863602143155cac6de54178c0d005dfea8381f8408ff943ab9c032c1b1c6`.
- `LMS_REVIEWABLE_EXTERNAL_CHANGE_PLAN_QA_20260913.json`: `86b0b228cd512576f6046100c8f0da8ec18c17bf709b68d02db8bed528f9c733`, статус `PASS_PREPARED_NOT_APPLIED`.
- `INDEPENDENT_11_MODULE_LMS_PLAN_QA_20260913.json`: `4a8d0d44d63e86a484a5619b96befe7b47094d06407483e23a98a101c1fbc6df`, статус `PASS_PREPARED_NOT_APPLIED`.

Эти хэши фиксируют локальные планы и не доказывают применение в production. `supabase/functions/mcp/index.ts` в этот выпуск не входит.
