# Интеграция ГОРЭЛТЕХ с актуальной основной веткой

Начато 04.09.2026, продолжено 05.09.2026 (Asia/Vladivostok).
Это локальный кандидат, не приёмка production.

## Зафиксированные изменения

- В feature-ветку `codex/goreltech-group-attendance-20260904` включена
  `origin/main=7a2d9e08a7d337103920524f37443d5b9a1e13b0`.
  Merge `c907966782ce2cebd2eb79710efe5d896916d513`, без текстовых конфликтов.
- Предыдущие 58 файлов основной ветки с библиотекой/импортом ЦСЗ сохранены.
  `StudentDashboard`, `CourseLearning`, `CourseSidebar`, `useStudentDashboard`,
  `useCourseLearningFacade` побайтно совпадают с основной веткой.
- Восстановлены 13 строк описания типов существующих SQL-колонки
  `balance_transactions.idempotency_key` и RPC `apply_tbank_balance_credit`.
  До восстановления реальный security-test: 3/4 PASS, 1 FAIL.
  Это только TypeScript-контракт: интерфейс, SDK, права, платежи и настройки
  Т-Банка не включались и не менялись.
- В isolated-тесте reconciliation задан синтетический auth-контекст.
  Реальный `GroupCompletionDecisionsCard` и все прежние assertions сохранены.
  Production-код компонента не менялся.
- Добавлен `scripts/verify-csz-group-integration.mjs`: исполнение точных SQL
  миграций ЦСЗ и регистрации в одной синтетической БД, не статический поиск строк.

Исходники проверенного кандидата: `3820f8d62b9abd72771f032a1d10b6c9d95a3fcb`.

## Проверки

| Проверка | Фактический результат |
| --- | --- |
| App TypeScript (`tsc -p tsconfig.app.json --noEmit`) | Exit 0 |
| ESLint трёх изменённых файлов | Exit 0, без сообщений |
| Выбранные regression tests | 337/359 PASS; 22 упали только из-за отсутствия auth-контекста test fixture |
| Повтор 22 reconciliation tests после fixture fix | 22/22 PASS, exit 0 |
| Полный Vitest | Exit 0: 265 файлов, 2944 PASS, 0 FAIL, 1 пропущен; около 14 минут |
| Дополнительный прогон реального подготовленного CSZ-пакета | Exit 0; ранее пропущенный env-зависимый сценарий выполнен и PASS |
| Совместный SQL harness | 17 PASS и два итоговых marker полного штатного CSZ RLS-контракта |
| Production build | Exit 0, 1m 54s, PWA 288 entries |

`dist/build-info.json`: gitCommit `3820f8d62b9abd72771f032a1d10b6c9d95a3fcb`,
trackedDirty `false`, builtAt `2026-09-04T13:59:47.371Z`.
После окончания сборки восстановлен только перегенерированный MCP-файл;
его git blob снова `53dd7ec52bf08159777c71b4c9ceb1c31965e857`, как до сборки.
Генератор под Windows не должен поставлять локальный путь как npm-import.

Артефакты на D:

- `D:/CodexTmp/sintagma-integration-type-baseline-20260904.json`.
- `D:/CodexTmp/sintagma-main-integration-gates-20260904.json`.
- `D:/CodexTmp/sintagma-reconciliation-auth-fixture-20260904.json`.
- `D:/CodexTmp/sintagma-integrated-full-suite-20260904.json`.
- `D:/CodexTmp/sintagma-integrated-full-suite-20260904.log`.
- `D:/CodexTmp/sintagma-integrated-prepared-csz-20260905.json`.
- `D:/CodexTmp/sintagma-integrated-prepared-csz-20260905.log`.
- `D:/CodexTmp/sintagma-integrated-release-build-20260904.log`.
- `D:/CodexTmp/sintagma-csz-group-integration-20260904-OSK6mO/report.json`.

Единственный skip полного прогона — внешний подготовленный пакет ЦСЗ:
тест требует `CSZ_COURSE_HTML` и `CSZ_COURSE_KEYS`. После проверки наличия
двух исходных файлов по D-путям из `CSZ_STRUCTURED_IMPORT_RELEASE.md`
повторён `src/utils/structuredCourseImport.test.ts` с этими переменными.
Использованы настоящие подготовленные файлы, не новая синтетическая замена;
закрытые ключи не выводились и не передавались в сеть. Это структурная
проверка импорта, не актуализация содержания нормативных ссылок.

В полном логе есть ожидаемый вывод сценария `useAuth` вне `AuthProvider`;
сам этот тест проверяет `toThrow` и прошёл. Проваленных тестов нет.
Никакие проверки не отключались ради зелёного результата.

## Что доказывает совместный SQL-прогон

Неизменённые миграции `20260903100000`, `20260903110000`, `20260904200000`
исполнены совместно с настоящими предшествующими registration RPC/trigger
миграциями. Проверены неизменность CSZ policies/helper, закрытый bucket,
отказ read-only преподавателю, отклонение некорректного импорта и создание
неопубликованного курса (11 модулей, 35 уроков, 67 вопросов, 8 материалов).

Регистрация в группу такого курса создаёт зачисление. Ученик получает только
разрешённую оболочку библиотеки; материал открывается после явной активации
сотрудником. Проверены чужие tenant/group/course, истёкшее зачисление,
сохранение completed-контракта ЦСЗ, отсутствие восстановления удалённого
зачисления при неизменном сохранении группы/профиля и однократный учёт квоты.

Граница: PGlite и явно обозначенные schema/auth fixtures. Это не реальный
Supabase JWT/PostgREST/Storage API, не live RLS и не новая проверка конкурентности.
Native PostgreSQL конкурентность регистрации проверена отдельно ранее.
Два первоначальных сбоя harness были вызваны отправкой psql-контракта одной
транзакционной пачкой; после сохранения исходных границ BEGIN/ROLLBACK полный
неизменённый SQL-контракт прошёл. Assertions не удалялись и не ослаблялись.

## Production и оставшиеся условия

Повторный безопасный внешний probe без авторизации/персональных данных:

- `/build-info.json?verify=20260904-integration`: HTTP 200, `text/html`,
  HTML оболочки. Точный SHA frontend НЕ подтверждён.
- `POST {}` через Nginx `/sb-functions/register-student`: HTTP 401,
  `Authentication required`, ревизия `enrollment-persistence-v3`.
  Кандидат v5 этим ответом не подтверждается и не считается развёрнутым.

В этом этапе не выполнялись production-миграции, Edge deployment, публикация,
создание реальных учеников/групп или экспорт персональных данных.
Перед выпуском нужны разрешённая резервная копия и проверка восстановления,
точный план additive migrations, Edge/frontend/Nginx и реальная проверка UI
с перезагрузкой. Согласие на ранее отдельно запрошенный backup с ПД пока не получено.

Ещё не приняты: все девять документов ГОРЭЛТЕХ на реальном кейсе, длинные/
пустые варианты, официальный XML Минтруда/XSD/API и общая оценка интерфейса 8/10.
