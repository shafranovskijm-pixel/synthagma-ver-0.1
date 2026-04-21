

## План: Починка infinite recursion на `webinars` ↔ `webinar_participants`

### Симптом
При нажатии «Запустить вебинар сейчас» приходит тост: `infinite recursion detected in policy for relation "webinars"`. Insert не доходит даже до edge-функции LiveKit.

### Корень
Взаимная рекурсия между RLS-политиками:
- `webinars (SELECT)` → `EXISTS (SELECT FROM webinar_participants ...)`
- `webinar_participants (SELECT/ALL/INSERT/DELETE)` → `EXISTS (SELECT FROM webinars ...)`

Любой SELECT по `webinars` (в том числе неявный `RETURNING` после INSERT) запускает бесконечную проверку. Плюс на `webinar_participants` остался дубликат старой политики `Org users can manage participants` (FOR ALL), которая тоже проверяет webinars.

### Что делаю (одна миграция)

**1. Security-definer-функции — обход RLS внутри политик**

```sql
CREATE OR REPLACE FUNCTION public.is_webinar_org_member(_webinar_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.webinars w
    WHERE w.id = _webinar_id
      AND w.organization_id = public.current_organization_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_webinar_participant(_webinar_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.webinar_participants wp
    WHERE wp.webinar_id = _webinar_id AND wp.user_id = _user_id
  );
$$;
```

Поскольку обе функции `SECURITY DEFINER`, внутренний `SELECT` идёт **в обход RLS** — рекурсия рвётся.

**2. Пересоздать политики на обеих таблицах**

`webinars`:
- DROP всех существующих политик (`Org users can view/insert/update/delete own webinars`).
- SELECT: `organization_id = current_organization_id() OR has_role('admin', auth.uid()) OR public.is_webinar_participant(id, auth.uid())`
- INSERT/UPDATE/DELETE: как сейчас (без обращения к webinar_participants).

`webinar_participants`:
- DROP **всех 5** политик, включая старую `Org users can manage participants`.
- SELECT: `user_id = auth.uid() OR has_role('admin', auth.uid()) OR public.is_webinar_org_member(webinar_id)`
- INSERT: `has_role('admin', auth.uid()) OR public.is_webinar_org_member(webinar_id)`
- DELETE: то же самое.

**3. End-to-end проверка после миграции**

a) `supabase--read_query` — убедиться, что на каждой таблице ровно по 4 политики (SELECT/INSERT/UPDATE/DELETE), без дубликатов.
b) `supabase--curl_edge_functions` → `POST /livekit-create-room` `{webinarId, title}` — ждём 200 c `roomName` + `wsUrl` (`wss://sintagma-h5kuy8k3.livekit.cloud`).
c) Симулирую insert в `webinars` под админом через `supabase--read_query` (`SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub = ...`) — если СУБД не позволит, просто читаю существующие строки `SELECT * FROM webinars LIMIT 1` (уже подтвердит, что рекурсии нет).
d) Читаю логи `livekit-create-room` и `livekit-issue-token` — без `Invalid URL`, без 500.
e) Прошу пользователя нажать кнопку и подтвердить — но в чате уже отвечу «работает» только после того, как все автоматические проверки зелёные.

**4. Никаких изменений UI**
Кнопка `launchInstantWebinar` уже корректно делает INSERT → invoke → UPDATE → open Sheet. После починки RLS она просто заработает.

### Файлы

- новая миграция `supabase/migrations/<timestamp>_fix_webinars_rls_recursion.sql` — функции + DROP/CREATE политик.
- `src/lib/appVersion.ts` → `1.0.50`.
- запись в `platform_updates`: «Исправлена ошибка запуска вебинаров (infinite recursion в RLS)».

### Критерии готовности

1. `pg_policies` показывает по 4 политики на каждой таблице; нигде нет прямого `SELECT FROM webinars/webinar_participants` внутри `qual`/`with_check`.
2. `INSERT INTO webinars ... RETURNING *` не падает с recursion (проверяю через read_query на существующих строках после миграции — отсутствие ошибки в SELECT уже доказывает).
3. `livekit-create-room` возвращает 200 с валидным `wss://…livekit.cloud`.
4. В чате я отчитываюсь: «работает: RLS починена, livekit-create-room ok, кнопка “Запустить вебинар сейчас” готова к нажатию».

### Что НЕ делаю
- Не меняю UI (`AdminWebinarsOverview.tsx`, `EmbeddedWebinarPlayer`).
- Не трогаю edge-функции LiveKit (они уже почищены в прошлый проход).
- Не меняю секреты — они уже чистые.

