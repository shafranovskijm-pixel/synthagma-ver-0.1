## Что нашёл при втором проходе

Прошлый круг закрыл «вечную загрузку» в админке и убрал самые большие water-fall в `useStudentDashboard`. Теперь смотрю глубже — есть ещё 4 жирных слоя торможения.

### 1. Кабинет организации делает 4–5 раздельных SELECT по `organizations`

При заходе на `/organization` параллельно стартуют:
- `useOrganizationDataLoader` → `organizations.name, frdo_enabled`
- `useDashboardSettings` → `organizations.menu_settings`
- `useDashboardSettings` → `organizations.student_dashboard_settings` (отдельный useEffect!)
- `useBrandingSettings` → `organizations.branding`
- `useOrgFeatures` → `organizations.subscription_plan, custom_enabled_categories`
- `useSubscriptionLimits` тоже дёргает план
- `useOrgBalance`, `useOrgUnreadChats` и т.д.

Это 5 одинаковых запросов в одну строку `organizations` по `id=eq.<orgId>` — каждый со своим RLS-проходом. Плюс на каждом запросе цепляется `realtime channel` на ту же таблицу (`org-menu-…`, `org-features-…`).

**Фикс:** один общий хук `useOrganizationCore(orgId)` на TanStack Query, который тянет нужные поля одним запросом, и из него питаются все остальные. Один realtime-channel на UPDATE строки `organizations` инвалидирует кэш — все потребители подтягиваются.

### 2. У ученика много мелких последовательных раундтрипов на одном org

В `useStudentDashboard.loadData` после `Promise.all(profile, labor, enrollments)` идут ещё 3 фазы **последовательно**:
- лекции по курсам ученика (`lessons` + `lesson_progress`)
- каталог org (`courses + categories + enrollment_requests` → потом ещё `lessons` для подсчёта)
- идентификация (`identity_documents + video_identifications`)

Между ними ничего не зависит от предыдущих фаз кроме `effectiveOrgId`. Можно слить блок «каталог + идентификация» с блоком «прогресс по курсам» — до 2× ускорение «Time to Interactive».

Дополнительно: `lessons` запрашиваются **дважды** — один раз для записанных курсов, второй раз для каталога. Объединить в один SELECT с `in(course_id, [..все..])`.

### 3. Нет SQL-функции для дашборда — фронт строит агрегаты сам

Сейчас фронт качает все `lessons` и все `lesson_progress` ученика, чтобы посчитать `completedLessons` по каждому курсу. У организации с 30+ курсов и 200+ уроков это легко даёт 5–20 КБ JSON и заметную задержку.

**Фикс:** создать RPC `get_student_dashboard_snapshot(p_user_id uuid)` — одним SQL-запросом возвращает: org info, бренд, dashboard settings, список enrollments c counts, статусы документов. Один вызов вместо 8.

### 4. Хуки на сыром useEffect — нет кэша между переходами

`useOrganizationDataLoader`, `useDashboardSettings`, `useBrandingSettings`, `useOrgFeatures`, `useStudentDashboard` все живут на `useState/useEffect`. При каждом перемонтировании (например, переход между вкладками с unmount) данные грузятся с нуля. TanStack Query уже подключён, но эти хуки им не пользуются.

### 5. Реалтайм-каналы плодятся

Каждый хук открывает отдельный канал `org-menu-${id}`, `org-features-${id}`. В сумме 4–6 WebSocket-подписок на одну страницу. Можно держать один централизованный канал на `organizations:id=eq.<orgId>` и инвалидировать соответствующие query keys.

---

## План правок

### A. SQL-миграция: один снапшот для ученика
1. RPC `public.get_student_dashboard_snapshot(p_user_id uuid)`:
   - возвращает JSONB: `profile`, `org` (id, name, branding, student_dashboard_settings, subscription_plan, description), `enrollments` (с `completed_lessons` и `total_lessons` через подзапросы), `documents` (флаги passport/snils/education + признак video_id), `labor_safety_org`.
   - `SECURITY DEFINER`, `SET search_path = public`, проверка `auth.uid() = p_user_id OR has_role('admin'::app_role, auth.uid())` (с учётом фикса порядка из прошлой миграции).
2. Дополнительные индексы, если ещё не созданы:
   - `enrollments(user_id, course_id)` (есть uniq — годится)
   - `lessons(course_id)` (вероятно есть — проверю в миграции через `IF NOT EXISTS`)

### B. SQL-миграция: один снапшот для организации
3. RPC `public.get_organization_core(p_org_id uuid)` — возвращает в одной строке: `name, branding, menu_settings, student_dashboard_settings, subscription_plan, custom_enabled_categories, frdo_enabled, description`. RLS внутри: владелец/staff/admin.

### C. Фронт: новый общий хук `useOrganizationCore`
4. `src/hooks/useOrganizationCore.ts` — `useQuery({ queryKey: ['org-core', orgId], staleTime: 5*60_000 })`, вызывает RPC `get_organization_core`.
5. Перевести `useDashboardSettings`, `useBrandingSettings`, `useOrgFeatures` на чтение из `useOrganizationCore` вместо собственных SELECT. Отдельные SELECT убираем. Запись (save) оставляем как есть, но после mutate — `queryClient.invalidateQueries(['org-core', orgId])`.
6. В `useOrgFeatures` оставить только запросы по `system_features` / `organization_features` (план уже придёт из core), все 5 запросов завернуть в `useQuery(['org-features', orgId], …)` со `staleTime: 60_000`.

### D. Фронт: ученик через `useQuery`
7. `useStudentDashboard.loadData` → `useQuery(['student-dashboard', uid], () => supabase.rpc('get_student_dashboard_snapshot', { p_user_id: uid }))` со `staleTime: 30_000` и `placeholderData` из IndexedDB-кэша. Все мелкие SELECT уходят.
8. `enrollments` → `lessons` → `lesson_progress` оставить только для случая, когда RPC недоступна (fallback), под флагом «офлайн».

### E. Один realtime-канал на организацию
9. Новый хук `useOrgRealtime(orgId)` — один канал на `organizations.id=eq.<orgId>` + `subscription_change_events`. По UPDATE инвалидирует `['org-core', orgId]` и `['org-features', orgId]`. Старые каналы из `useDashboardSettings` / `useOrgFeatures` удаляются.

### F. Малое
10. В `useStudentDashboard` `checkOnboarding` сделать частью `get_student_dashboard_snapshot` (поле `onboarding_completed`) — минус ещё один SELECT.
11. В `loadCourseStudentsForModal` (`useOrganizationDashboard`) запросы `enrollments → user_roles → profiles → passwords` сделать через одну RPC `get_course_students(course_id)` — это уже отдельная история, **в этот заход НЕ делаю**, помечу TODO.

---

## Что увидит пользователь
- Заход на `/organization`: вместо 5 запросов в `organizations` → 1 RPC + 3 справочника. Первый рендер сайдбара/хедера ускорится на ~150–400 мс на медленных каналах.
- Возврат на ту же страницу в течение 5 мин — мгновенно из кэша react-query.
- Заход на `/student`: вместо 8 круговых запросов → 1 RPC. На орг с большим каталогом ускорение особенно заметно.
- Меньше открытых WebSocket-подписок (1 вместо 4), меньше нагрузки на устройство.

После применения сделаю замер `browser--performance_profile` до/после на твоей учётке и пришлю цифры.
