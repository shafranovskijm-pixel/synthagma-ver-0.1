## Проблемы, которые я нашёл

### 1. Админка → «Организации» падает с ошибкой и тормозит
В сетевом логе вижу:
```
POST /rpc/get_decrypted_org_credentials_batch → 404
"function public.has_role(uuid, app_role) does not exist"
```
Функция в БД определена как `has_role(_role app_role, _user_id uuid)` (роль первая, юзер второй), а внутри `get_decrypted_org_credentials_batch` вызывается с перепутанным порядком: `has_role(auth.uid(), 'admin')`. Из-за этого:
- Учётные данные организаций **никогда не подгружаются** (вечная «загрузка» паролей).
- Тот же баг скорее всего бьёт по `get_decrypted_student_password` и другим RPC, использующим `has_role` — отсюда «не вижу логин/пароль ученика».

### 2. Кабинет ученика делает много последовательных запросов
В `useStudentDashboard.ts` подряд идут запросы (видно в коде):
- `track_user_visit` RPC
- `user_achievements` (+ `update is_seen`)
- `profiles` + `organizations`
- `labor_safety_profiles` (если ничего не нашли)
- `enrollments` + `lessons` + `lesson_progress`
- `courses` каталога + `course_categories` + `enrollment_requests` + `lessons` каталога
- `student_identity_documents` + `video_identifications`

Часть из них уже идёт параллельно, но visit/achievements/profile/labor — последовательно. Плюс **нет составного индекса на `lesson_progress(user_id, lesson_id)` для completed-фильтра** (есть только `(user_id, completed, completed_at)`), и **нет индекса `enrollments(user_id)`** — есть только `course_id` и составной uniq.

### 3. Нет TanStack-кэша на этих хуках
`useStudentDashboard` и `useOrganizationsManager` написаны на «сыром» `useEffect + useState`, минуя `react-query`. При каждом возврате на страницу всё перезапрашивается заново, даже если данные не менялись.

---

## План правок

### A. Починить SQL-функции (миграция)
1. Переписать `get_decrypted_org_credentials_batch`: вызвать `public.has_role('admin'::app_role, auth.uid())` (правильный порядок).
2. Найти и поправить **все** функции в `public`, где есть `has_role(auth.uid(), …)` — переставить аргументы. Я пройдусь по `pg_proc` и сделаю фикс одним миграционным файлом.
3. Дополнительно создать перегрузку `public.has_role(uuid, app_role)` как тонкую обёртку, чтобы старые вызовы не падали в будущем.

### B. Индексы под кабинет ученика (миграция)
- `CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);`
- `CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_lesson_completed ON lesson_progress(user_id, lesson_id) WHERE completed = true;`
- `CREATE INDEX IF NOT EXISTS idx_student_identity_documents_user_org ON student_identity_documents(user_id, organization_id);`
- `CREATE INDEX IF NOT EXISTS idx_video_identifications_user_org_status ON video_identifications(user_id, organization_id, status);`

### C. Параллелизация запросов в `useStudentDashboard.ts`
- Объединить `track_user_visit`, `user_achievements`, `profiles+organizations` и `labor_safety_profiles` в один `Promise.all`.
- `enrollments` запрашивать сразу вместе с каталожным блоком (общий `Promise.all` после profile).
- Не блокировать первый рендер на `track_user_visit` (fire-and-forget).
- Кэшировать результат через `getCachedDashboardData` агрессивнее: показывать кэш мгновенно и только потом фоном обновлять (stale-while-revalidate уже частично есть — добью).

### D. `useOrganizationsManager` → лёгкий react-query
- Заменить `useState/useEffect` на `useQuery(['admin','orgs'], …)` со `staleTime: 60s`.
- После фикса A. батч-RPC начнёт реально работать → детали загрузятся за один заход.

### E. Глобальный staleTime для справочников
`QueryClient` уже стоит на `staleTime: 30s`. Для каталога курсов/категорий ученика поставлю локально `staleTime: 5 * 60_000` — они почти не меняются.

---

## Что увидит пользователь после фикса
- Админка → «Организации»: пароли и счётчики появляются за 1 запрос, без 404.
- Карточка ученика: логин/пароль расшифровываются стабильно.
- Кабинет ученика: первый рендер заметно быстрее (меньше последовательных раундтрипов), повторные заходы — почти мгновенно из кэша.
- Запросы к `lesson_progress` / `enrollments` ускорятся за счёт индексов (особенно у орг с большим числом учеников).

Если хочешь, после применения сделаю замер «до/после» на твоей учётке через `browser--performance_profile` и приложу цифры.
