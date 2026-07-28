## Фаза 3 — серверная пагинация вкладки «Ученики» организации

Базовый commit: `028620d0af979baa23bc4273b7db535a84e22bd4`. После завершения — стоп, Фазу 4 не начинаем.

### 1. Новая SQL-миграция (одна)

Файл: `supabase/migrations/<ts>_students_page_phase3.sql`. Существующую миграцию `20260728082057_...` не редактирую.

**1.1. `CREATE OR REPLACE FUNCTION public.get_organization_students_page(...)`** — переопределяю поверх текущей, сохраняя сигнатуру, но:
- документы считаю по агрегатам:
  - `has_passport = BOOL_OR(d.type IN ('passport','birth_certificate'))`
  - `has_snils = BOOL_OR(d.type = 'snils')`
  - `has_education = BOOL_OR(d.type IN ('education_document','diploma','attestat'))`
- фильтры `complete/incomplete/no_passport/no_snils/no_education` используют эти признаки.
- фильтр статуса переношу с агрегированного `r_status` на `EXISTS`-подзапросы:
  - `active` → есть enrollment со `status='active'`;
  - `completed` → есть enrollment со `status='completed'`;
  - `not_enrolled` → зачислений нет.
- сам возвращаемый `status` остаётся агрегированным (для совместимости UI).

**1.2. `get_organization_students_counts(p_organization_id uuid)`**
Возвращает одну строку: `active_count`, `archived_count`, `total_count`. Исключает admin / organization / активных `org_staff`. Не зависит от `p_search`/фильтров.

**1.3. `get_organization_student_group_counts(p_organization_id uuid)`**
Возвращает `group_id (nullable) | total_count | active_count | archived_count`, те же исключения.

**1.4. `get_decrypted_student_passwords_for_users(p_organization_id uuid, p_user_ids uuid[])`**
- Ограничение: не более 100 uuid;
- проверка `is_student_profile(user_id)` и `organization_id = p_organization_id`;
- доступ: `has_role(auth.uid(),'admin')` ИЛИ владелец организации ИЛИ `has_org_staff_permission(p_organization_id,'students.write')`;
- `pgp_sym_decrypt`, возвращает `user_id, decrypted_password`.

Все 4 функции: `SECURITY DEFINER`, `STABLE` (кроме 1.4 — тоже `STABLE`), `SET search_path=public`, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE authenticated, service_role`.

### 2. API (`src/api/students.ts`)

Добавляю без удаления `fetchStudents` (нужен legacy-пути):
- `fetchOrganizationStudentsPage(params)` — вызывает RPC, ограничивает `limit=10`, offset строится вызывающим.
- `fetchOrganizationStudentsCounts(orgId)`
- `fetchOrganizationStudentGroupCounts(orgId)`
- `fetchStudentPasswordsForUsers(orgId, userIds)`
- Один mapper `rowToStudent(row)` — правила из ТЗ (generated_password=null, безопасный parse enrollments, course/course_id только при 1 зачислении, lastActivity=last_activity, сохранение archived_at/student_group_id/serverных признаков).

Тип строки — из `Database['public']['Functions']['get_organization_students_page']['Returns'][number]`.

Оставшиеся вызовы `fetchStudents` укажу в отчёте.

### 3. Query keys (`src/lib/queryKeys.ts`)

```
qk.org.studentsPage(orgId, {search,course,group,status,docs,archive})
qk.org.studentsCounts(orgId)
qk.org.studentGroupCounts(orgId)
qk.org.studentCredentials(orgId, userId)
qk.org.studentsPageAll(orgId)  // префикс для инвалидации
```
`courseIdsKey` для новой страницы не использую.

### 4. `useStudents.ts` — переписан

- `useDebouncedValue(searchQuery, 350)`.
- `useInfiniteQuery` (page size 10) для активного списка **или** архива, в зависимости от `viewMode`. Ключ — `qk.org.studentsPage(...)`; `getNextPageParam` — если `rows.length===10` возвращает `offset+10`.
- `retry`: не более 2, только для `isTransientNetworkError`; 401/403/42501 — нет.
- Дедуп по `user_id` через `Set` при склейке страниц.
- `useQuery` для counts (`get_organization_students_counts`) → `activeStudentsCount` и `archivedCount`.
- `useQuery` для group counts.
- Убираю: `fetchStudentPasswords` (авто), fetch FRDO по всей странице (признаки уже в строках), клиентские фильтры `filteredStudents`, `archivedStudents.length` по массиву, `archiveByMonth` теперь строится по загруженным строкам архива с корректной догрузкой (Map ключ — `YYYY-MM`, дополняется).
- Ошибки: `initialError` / `nextPageError` / отдельно ошибки counts.
- `selectedStudentIds`: сохраняется при догрузке; сброс — при смене `search`/`course`/`group`/`status`/`docs`/`viewMode` (через `useEffect` на debounced-ключе).
- `toggleSelectAll` — только по загруженным (`students.map(user_id)`).
- Оставляю `bulkUnenroll/bulkDelete/enroll/...` работающими по загруженным моделям.
- Функция `fetchStudentCredentialsOnDemand(userId)` для точечного пароля (используется StudentTableRow).

### 5. `StudentsTab.tsx`

- Удаляю `visibleCount`, `paginatedStudents = filteredStudents.slice(0,visibleCount)`, `LoadMoreControls` (клиентские 25/50/100/Все).
- Использую `students` (склеенные страницы) напрямую. Под списком:
  - `Показано {loaded} из {total}`;
  - кнопка `Показать ещё {min(10, total-loaded)}`;
  - spinner при `isFetchingNextPage`;
  - retry при `isFetchNextPageError`.
- Первая страница не пропадает при ошибке догрузки.
- Архив: группировка по месяцам через `archiveByMonth` (уже из hook), дедупликация ключей при догрузке.
- Экспорт: переименовать в «Выгрузить показанных в Excel ({loaded})», работает только по загруженным.
- Групповые счётчики — `groupCounts.get(g.id)?.total_count ?? 0` вместо `Array.from(studentGroupMap.values()).filter(...)`.
- `panelMode==='groups'` не запускает страницы (query `enabled` только при active/archive).
- Пустой архив — текст про ручное архивирование (уже есть).

### 6. Row-компоненты

- `StudentTableRow.tsx` и `StudentMobileCard.tsx`: используют серверные признаки `has_passport/has_snils/has_education` и `frdo_has_data/frdo_complete` из `student.*` (расширяю `Student` optional-полями). Локальный fallback на `studentDocsByUser`/`frdoStatus` пока сохраняю, чтобы курсовая часть и другие вызовы не сломались.
- Кнопка «Копировать пароль»: если `generated_password` уже есть — копирует; иначе — вызывает `fetchStudentCredentialsOnDemand(user_id)`, показывает локальный spinner, ошибки классифицирую.

### 7. Что НЕ трогаю

`useOrganizationDataLoader`, `useOrganizationDashboard`, bulk-pipelines, полный Excel-экспорт, Bulk FRDO, генераторы документов, NGINX, курс-пагинацию, legacy-компоненты. В отчёте перечислю оставшиеся legacy-запросы.

### 8. Проверки

- `bunx tsgo --noEmit` + `bun run build`.
- SQL-проверки через `supabase--read_query` на организациях со 100+ учениками (Modern Mining / Синтагма): первая/вторая страница, счётчики при пустом поиске, ролевой фильтр, документы с birth_certificate/diploma, ученик с active+completed.
- Playwright-проход по вкладке (сеть: только 1 rpc `get_organization_students_page` + counts на входе, дебаунс поиска, отсутствие `get_decrypted_student_passwords` до клика).

### 9. Итоговый отчёт

Имя миграции, изменённые файлы, commit, число строк 1/2 страницы, сетевые запросы, оставшиеся legacy-запросы `useOrganizationDataLoader`, debounce, фильтры доков/статуса, счётчики, selection, on-demand пароль, TS/build результаты, что осталось на Фазу 4.

---

Если готов — подтверди, и я стартую с миграции.
