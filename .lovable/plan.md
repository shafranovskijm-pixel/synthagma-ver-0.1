## Цель

Сделать **один постоянный демо-кабинет ученика**, который уже укомплектован курсами. Кнопка «Посмотрите, как выглядит кабинет ученика» просто логинит в этот аккаунт, ничего не создавая на лету.

## Что будет сделано

### 1. Один раз создать постоянный демо-аккаунт (через миграцию + сид-функцию)

Создаётся **одна** запись в `auth.users` + `profiles`:

- email: `demo-student@sintagma.demo`
- пароль: фиксированный (хранится в секрете `DEMO_STUDENT_PASSWORD`)
- ФИО: «Иванов Иван Иванович»
- роль: `student`
- привязан к существующей платформенной демо-организации **«Демо-организация»** (organization_id = `4ac2c05a-d8b5-4e72-ba31-f2c743091d95` — это владелец маркетплейса с реальными курсами).
- `onboarding_completed = true`, `is_demo = true`.

**Курсы (4 «назначенных» с прогрессом)** — берём 4 готовых из маркетплейса `4ac2c05a-…`, создаём `enrollments` и реальные `lesson_progress`:

| # | Курс | Прогресс | Статус |
|---|------|---------|--------|
| 1 | Охрана труда | ~65% (8 из 12 уроков completed) | in_progress |
| 2 | Пожарная безопасность | 100% (все уроки + test_attempt с 90%) | completed |
| 3 | Первая помощь | ~30% | in_progress |
| 4 | Электробезопасность | 0% | not_started |

**Каталог (≈10 курсов «можно докупить»)** — ничего дополнительно делать не надо: в кабинете ученика каталог автоматически подтягивает все опубликованные курсы маркетплейса организации (`4ac2c05a-…`), которых там уже >10 → они появятся в секции ниже как «Магазин курсов».

**Документы**:

- В `student_identity_documents` создаём 2 записи (паспорт + СНИЛС, файлы — placeholder из `public/`); образования нет → прогресс «2/3».
- ПЭП и согласие на ПД **не создаём** → их можно вживую подписать в демо.

Всё это выполняется один раз в edge-функции `seed-demo-student` (idempotent: проверяет наличие аккаунта и пересоздаёт enrollments только если их нет). Запускается:
- автоматически из миграции через `pg_net` → `seed-demo-student` вызовом,
- или вручную админом через кнопку в `/admin` (на случай поломки).

### 2. Кнопка «Посмотрите, как выглядит кабинет ученика»

Файл `src/components/organization/tabs/students/StudentsEmptyState.tsx`:

- Вместо `previewStudentDashboard`-флага и `window.open('/student')`:
  1. Открывает `/demo-student-login` в новой вкладке.
- Никаких `functions.invoke` — кабинет уже существует.

### 3. Новая страница `/demo-student-login`

`src/pages/DemoStudentLogin.tsx`:

- При маунте вызывает edge-функцию `demo-student-signin` (без JWT) → возвращает `{ email, password }` из секрета.
- Делает `supabase.auth.signInWithPassword` и `navigate('/student', { replace: true })`.
- Если уже залогинен админ в этой вкладке — мы открыли в **новой** вкладке, так что чужой сессии нет.

### 4. Удалить захардкоженный preview-режим

В `src/hooks/useStudentDashboard.ts` (строки ~265-293) и `src/pages/StudentDashboard.tsx` (`isPreviewFromStorage`) убрать ветку с `demo-1..demo-4` — она и вызывала «мелькание» (фейк перетирался реальными данными). Теперь `/student` всегда показывает реальные данные демо-аккаунта.

## Файлы

```text
supabase/functions/seed-demo-student/index.ts     новый (idempotent сид)
supabase/functions/demo-student-signin/index.ts   новый (отдаёт креды)
supabase/migrations/<ts>_demo_student.sql         + is_demo на profiles, вызов seed
src/pages/DemoStudentLogin.tsx                    новая страница
src/routes/publicRoutes.tsx                       + /demo-student-login
src/components/organization/tabs/students/
  StudentsEmptyState.tsx                          кнопка → открывает новую страницу
src/hooks/useStudentDashboard.ts                  удалить fake-preview блок
src/pages/StudentDashboard.tsx                    убрать isPreviewFromStorage
```

## Секреты

- `DEMO_STUDENT_PASSWORD` — фиксированный пароль демо-аккаунта (запросим у вас).

## Безопасность

- Демо-аккаунт привязан к платформенной демо-организации, своих учеников/документов чужой организации не видит (RLS).
- `demo-student-signin` отдаёт креды только для одного email с маркером `is_demo = true` — никаких других аккаунтов выдать не сможет.
- Демо-аккаунт переживает сессии: что один зритель «подписал» в ПЭП — увидит следующий. Если важно сбрасывать каждые сутки — добавим cron `reset-demo-student-daily` (по запросу).
