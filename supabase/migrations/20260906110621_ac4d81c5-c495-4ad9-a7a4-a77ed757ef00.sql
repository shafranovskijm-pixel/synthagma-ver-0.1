-- Модуль «Автошколы» (driving_*) для СИНТАГМЫ: изолированная additive-миграция.
-- Все сущности принадлежат public.organizations; tenant-composite FK (organization_id, id)
-- делают невозможной связь записей двух школ. Запись только через SECURITY DEFINER RPC.

DO $$ BEGIN CREATE TYPE public.driving_transmission AS ENUM ('MT','AT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.driving_lesson_status AS ENUM ('booked','completed','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.driving_entry_kind AS ENUM ('charge','payment','exam','attempt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.driving_member_role AS ENUM ('student','instructor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.driving_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ───────────────── Таблицы ─────────────────
CREATE TABLE IF NOT EXISTS public.driving_schools (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  horizon_days integer NOT NULL DEFAULT 30 CHECK (horizon_days BETWEEN 1 AND 90),
  cancel_hours integer NOT NULL DEFAULT 12 CHECK (cancel_hours BETWEEN 0 AND 168),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.driving_schools TO authenticated;
GRANT ALL ON public.driving_schools TO service_role;
ALTER TABLE public.driving_schools ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_programs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text NOT NULL,
  category text NOT NULL DEFAULT 'B',
  transmission public.driving_transmission NOT NULL DEFAULT 'MT',
  practice_minutes integer NOT NULL CHECK (practice_minutes BETWEEN 60 AND 60000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_programs_tenant_key UNIQUE (organization_id, id)
);
GRANT SELECT ON public.driving_programs TO authenticated;
GRANT ALL ON public.driving_programs TO service_role;
ALTER TABLE public.driving_programs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_cars (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  number text NOT NULL,
  category text NOT NULL DEFAULT 'B',
  transmission public.driving_transmission NOT NULL DEFAULT 'MT',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_cars_tenant_key UNIQUE (organization_id, id)
);
GRANT SELECT ON public.driving_cars TO authenticated;
GRANT ALL ON public.driving_cars TO service_role;
ALTER TABLE public.driving_cars ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_instructors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  car_id uuid,
  user_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_instructors_tenant_key UNIQUE (organization_id, id),
  CONSTRAINT driving_instructors_car_fkey FOREIGN KEY (organization_id, car_id)
    REFERENCES public.driving_cars(organization_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS driving_instructors_user_unique
  ON public.driving_instructors(organization_id, user_id) WHERE user_id IS NOT NULL;
GRANT SELECT ON public.driving_instructors TO authenticated;
GRANT ALL ON public.driving_instructors TO service_role;
ALTER TABLE public.driving_instructors ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_shifts_range CHECK (ends_at > starts_at),
  CONSTRAINT driving_shifts_tenant_key UNIQUE (organization_id, id),
  CONSTRAINT driving_shifts_instructor_fkey FOREIGN KEY (organization_id, instructor_id)
    REFERENCES public.driving_instructors(organization_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS driving_shifts_lookup
  ON public.driving_shifts(organization_id, instructor_id, starts_at);
GRANT SELECT ON public.driving_shifts TO authenticated;
GRANT ALL ON public.driving_shifts TO service_role;
ALTER TABLE public.driving_shifts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  program_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_groups_tenant_key UNIQUE (organization_id, id),
  CONSTRAINT driving_groups_program_fkey FOREIGN KEY (organization_id, program_id)
    REFERENCES public.driving_programs(organization_id, id) ON DELETE RESTRICT
);
GRANT SELECT ON public.driving_groups TO authenticated;
GRANT ALL ON public.driving_groups TO service_role;
ALTER TABLE public.driving_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_students (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  user_id uuid,
  program_id uuid NOT NULL,
  group_id uuid,
  instructor_id uuid,
  practice_minutes integer NOT NULL CHECK (practice_minutes BETWEEN 60 AND 60000),
  transmission public.driving_transmission NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_students_tenant_key UNIQUE (organization_id, id),
  CONSTRAINT driving_students_program_fkey FOREIGN KEY (organization_id, program_id)
    REFERENCES public.driving_programs(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT driving_students_group_fkey FOREIGN KEY (organization_id, group_id)
    REFERENCES public.driving_groups(organization_id, id) ON DELETE SET NULL,
  CONSTRAINT driving_students_instructor_fkey FOREIGN KEY (organization_id, instructor_id)
    REFERENCES public.driving_instructors(organization_id, id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS driving_students_user_unique
  ON public.driving_students(organization_id, user_id) WHERE user_id IS NOT NULL;
GRANT SELECT ON public.driving_students TO authenticated;
GRANT ALL ON public.driving_students TO service_role;
ALTER TABLE public.driving_students ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_lessons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  instructor_id uuid NOT NULL,
  car_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.driving_lesson_status NOT NULL DEFAULT 'booked',
  actual_minutes integer NOT NULL DEFAULT 0 CHECK (actual_minutes >= 0),
  topic text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 0,
  created_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_lessons_range CHECK (ends_at > starts_at),
  CONSTRAINT driving_lessons_tenant_key UNIQUE (organization_id, id),
  CONSTRAINT driving_lessons_student_fkey FOREIGN KEY (organization_id, student_id)
    REFERENCES public.driving_students(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT driving_lessons_instructor_fkey FOREIGN KEY (organization_id, instructor_id)
    REFERENCES public.driving_instructors(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT driving_lessons_car_fkey FOREIGN KEY (organization_id, car_id)
    REFERENCES public.driving_cars(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS driving_lessons_time
  ON public.driving_lessons(organization_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS driving_lessons_student
  ON public.driving_lessons(organization_id, student_id, starts_at);
CREATE INDEX IF NOT EXISTS driving_lessons_instructor
  ON public.driving_lessons(organization_id, instructor_id, starts_at);
CREATE INDEX IF NOT EXISTS driving_lessons_car
  ON public.driving_lessons(organization_id, car_id, starts_at);
GRANT SELECT ON public.driving_lessons TO authenticated;
GRANT ALL ON public.driving_lessons TO service_role;
ALTER TABLE public.driving_lessons ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_courses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  program_id uuid NOT NULL,
  name text NOT NULL,
  material text NOT NULL DEFAULT '',
  pass_percent integer NOT NULL DEFAULT 100 CHECK (pass_percent BETWEEN 1 AND 100),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  lms_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_courses_tenant_key UNIQUE (organization_id, id),
  CONSTRAINT driving_courses_program_fkey FOREIGN KEY (organization_id, program_id)
    REFERENCES public.driving_programs(organization_id, id) ON DELETE CASCADE
);
GRANT SELECT ON public.driving_courses TO authenticated;
GRANT ALL ON public.driving_courses TO service_role;
ALTER TABLE public.driving_courses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  kind public.driving_entry_kind NOT NULL,
  data jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_entries_tenant_key UNIQUE (organization_id, id),
  CONSTRAINT driving_entries_student_fkey FOREIGN KEY (organization_id, student_id)
    REFERENCES public.driving_students(organization_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS driving_entries_student
  ON public.driving_entries(organization_id, student_id, created_at DESC);
GRANT SELECT ON public.driving_entries TO authenticated;
GRANT ALL ON public.driving_entries TO service_role;
ALTER TABLE public.driving_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_entry_reversals (
  entry_id uuid NOT NULL PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_entry_reversals_entry_fkey FOREIGN KEY (organization_id, entry_id)
    REFERENCES public.driving_entries(organization_id, id) ON DELETE CASCADE
);
GRANT SELECT ON public.driving_entry_reversals TO authenticated;
GRANT ALL ON public.driving_entry_reversals TO service_role;
ALTER TABLE public.driving_entry_reversals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_operations (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  operation_id text NOT NULL,
  payload_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, operation_id)
);
GRANT SELECT ON public.driving_operations TO authenticated;
GRANT ALL ON public.driving_operations TO service_role;
ALTER TABLE public.driving_operations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_audit (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driving_audit_org ON public.driving_audit(organization_id, id DESC);
GRANT SELECT ON public.driving_audit TO authenticated;
GRANT ALL ON public.driving_audit TO service_role;
ALTER TABLE public.driving_audit ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.driving_member_role NOT NULL,
  student_id uuid,
  instructor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_memberships_unique UNIQUE (organization_id, user_id, role),
  CONSTRAINT driving_memberships_target CHECK (
    (role = 'student' AND student_id IS NOT NULL AND instructor_id IS NULL)
    OR (role = 'instructor' AND instructor_id IS NOT NULL AND student_id IS NULL)),
  CONSTRAINT driving_memberships_student_fkey FOREIGN KEY (organization_id, student_id)
    REFERENCES public.driving_students(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT driving_memberships_instructor_fkey FOREIGN KEY (organization_id, instructor_id)
    REFERENCES public.driving_instructors(organization_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS driving_memberships_user ON public.driving_memberships(user_id);
GRANT SELECT ON public.driving_memberships TO authenticated;
GRANT ALL ON public.driving_memberships TO service_role;
ALTER TABLE public.driving_memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.driving_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  role public.driving_member_role NOT NULL,
  student_id uuid,
  instructor_id uuid,
  email text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driving_invites_target CHECK (
    (role = 'student' AND student_id IS NOT NULL AND instructor_id IS NULL)
    OR (role = 'instructor' AND instructor_id IS NOT NULL AND student_id IS NULL)),
  CONSTRAINT driving_invites_student_fkey FOREIGN KEY (organization_id, student_id)
    REFERENCES public.driving_students(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT driving_invites_instructor_fkey FOREIGN KEY (organization_id, instructor_id)
    REFERENCES public.driving_instructors(organization_id, id) ON DELETE CASCADE
);
-- Токены приглашений клиенту недоступны: только service_role и RPC.
GRANT ALL ON public.driving_invites TO service_role;
ALTER TABLE public.driving_invites ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['driving_schools','driving_programs','driving_cars',
    'driving_instructors','driving_shifts','driving_groups','driving_students',
    'driving_lessons','driving_courses','driving_memberships'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.driving_touch_updated_at()', t || '_touch', t);
  END LOOP;
END $$;

-- ───────────────── Проверки доступа (fail-closed) ─────────────────
CREATE OR REPLACE FUNCTION public.driving_can_manage(_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _organization_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
    public.has_role('admin'::app_role, auth.uid())
    OR (public.has_role('organization'::app_role, auth.uid())
        AND public.current_organization_id() = _organization_id)
    OR EXISTS (
      SELECT 1 FROM public.org_staff s
      WHERE s.user_id = auth.uid() AND s.organization_id = _organization_id
        AND (s.expires_at IS NULL OR s.expires_at > now())
        AND public.has_org_staff_permission(auth.uid(), _organization_id, 'students.write'))
  );
$$;

CREATE OR REPLACE FUNCTION public.driving_can_read(_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.driving_can_manage(_organization_id) OR EXISTS (
    SELECT 1 FROM public.org_staff s
    WHERE s.user_id = auth.uid() AND s.organization_id = _organization_id
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND public.has_org_staff_permission(auth.uid(), _organization_id, 'students.read'));
$$;

CREATE OR REPLACE FUNCTION public.driving_membership(_organization_id uuid)
RETURNS TABLE (role public.driving_member_role, student_id uuid, instructor_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role, m.student_id, m.instructor_id
  FROM public.driving_memberships m
  WHERE m.user_id = auth.uid() AND m.organization_id = _organization_id
  ORDER BY CASE m.role WHEN 'instructor' THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.driving_is_member(_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.driving_membership(_organization_id));
$$;

REVOKE ALL ON FUNCTION public.driving_can_manage(uuid) FROM public;
REVOKE ALL ON FUNCTION public.driving_can_read(uuid) FROM public;
REVOKE ALL ON FUNCTION public.driving_membership(uuid) FROM public;
REVOKE ALL ON FUNCTION public.driving_is_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.driving_can_manage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_can_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_membership(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_is_member(uuid) TO authenticated, service_role;

-- ───────────────── RLS: только чтение и только своё ─────────────────
CREATE POLICY "driving_schools_read_scoped" ON public.driving_schools
FOR SELECT TO authenticated
USING (public.driving_can_read(organization_id) OR public.driving_is_member(organization_id));

CREATE POLICY "driving_programs_read_scoped" ON public.driving_programs
FOR SELECT TO authenticated
USING (public.driving_can_read(organization_id) OR public.driving_is_member(organization_id));

CREATE POLICY "driving_cars_read_scoped" ON public.driving_cars
FOR SELECT TO authenticated
USING (public.driving_can_read(organization_id) OR public.driving_is_member(organization_id));

CREATE POLICY "driving_instructors_read_scoped" ON public.driving_instructors
FOR SELECT TO authenticated
USING (public.driving_can_read(organization_id) OR public.driving_is_member(organization_id));

CREATE POLICY "driving_shifts_read_scoped" ON public.driving_shifts
FOR SELECT TO authenticated
USING (public.driving_can_read(organization_id) OR public.driving_is_member(organization_id));

CREATE POLICY "driving_groups_read_scoped" ON public.driving_groups
FOR SELECT TO authenticated
USING (public.driving_can_read(organization_id) OR public.driving_is_member(organization_id));

CREATE POLICY "driving_students_read_scoped" ON public.driving_students
FOR SELECT TO authenticated
USING (public.driving_can_read(organization_id) OR EXISTS (
  SELECT 1 FROM public.driving_membership(organization_id) m
  WHERE (m.role = 'student' AND m.student_id = driving_students.id)
     OR (m.role = 'instructor' AND m.instructor_id = driving_students.instructor_id)));

CREATE POLICY "driving_lessons_read_scoped" ON public.driving_lessons
FOR SELECT TO authenticated
USING (public.driving_can_read(organization_id) OR EXISTS (
  SELECT 1 FROM public.driving_membership(organization_id) m
  WHERE (m.role = 'student' AND m.student_id = driving_lessons.student_id)
     OR (m.role = 'instructor' AND m.instructor_id = driving_lessons.instructor_id)));

-- Верные ответы в questions: прямое чтение только управляющему кабинету.
CREATE POLICY "driving_courses_read_scoped" ON public.driving_courses
FOR SELECT TO authenticated USING (public.driving_can_read(organization_id));

CREATE POLICY "driving_entries_read_scoped" ON public.driving_entries
FOR SELECT TO authenticated
USING (public.driving_can_read(organization_id) OR EXISTS (
  SELECT 1 FROM public.driving_membership(organization_id) m
  WHERE m.role = 'student' AND m.student_id = driving_entries.student_id));

CREATE POLICY "driving_entry_reversals_read_scoped" ON public.driving_entry_reversals
FOR SELECT TO authenticated USING (public.driving_can_read(organization_id));

CREATE POLICY "driving_operations_read_scoped" ON public.driving_operations
FOR SELECT TO authenticated USING (public.driving_can_manage(organization_id));

CREATE POLICY "driving_audit_read_scoped" ON public.driving_audit
FOR SELECT TO authenticated USING (public.driving_can_manage(organization_id));

CREATE POLICY "driving_memberships_read_scoped" ON public.driving_memberships
FOR SELECT TO authenticated
USING (public.driving_can_read(organization_id) OR user_id = auth.uid());

-- ───────────────── Внутренние помощники ─────────────────
CREATE OR REPLACE FUNCTION public.driving_assert_manage(_organization_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.driving_can_manage(_organization_id) THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: нет прав администратора автошколы в этой организации'
      USING ERRCODE = '42501';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.driving_log(
  _organization_id uuid, _action text, _target text DEFAULT '', _detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.driving_audit(organization_id, user_id, action, target, detail)
  VALUES (_organization_id, auth.uid(), _action, COALESCE(_target,''), COALESCE(_detail,'{}'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.driving_student_minutes(
  _organization_id uuid, _student_id uuid, _excluded_lesson uuid DEFAULT NULL)
RETURNS TABLE (completed integer, reserved integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(CASE WHEN l.status = 'completed' THEN l.actual_minutes ELSE 0 END),0)::integer,
    COALESCE(SUM(CASE WHEN l.status = 'booked'
      THEN (EXTRACT(EPOCH FROM (l.ends_at - l.starts_at))::integer)/60 ELSE 0 END),0)::integer
  FROM public.driving_lessons l
  WHERE l.organization_id = _organization_id AND l.student_id = _student_id
    AND (_excluded_lesson IS NULL OR l.id <> _excluded_lesson);
$$;

REVOKE ALL ON FUNCTION public.driving_assert_manage(uuid) FROM public;
REVOKE ALL ON FUNCTION public.driving_log(uuid, text, text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.driving_student_minutes(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.driving_student_minutes(uuid, uuid, uuid) TO authenticated, service_role;

-- ───────────────── Подключение модуля и статус ─────────────────
CREATE OR REPLACE FUNCTION public.driving_connect_module(
  _organization_id uuid, _timezone text DEFAULT 'Europe/Moscow')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org public.organizations; v_school public.driving_schools;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  SELECT * INTO v_org FROM public.organizations WHERE id = _organization_id;
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: организация не найдена' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_school FROM public.driving_schools WHERE organization_id = _organization_id;
  IF v_school.id IS NULL THEN
    INSERT INTO public.driving_schools(organization_id, name, timezone, created_by)
    VALUES (_organization_id, v_org.name, COALESCE(NULLIF(_timezone,''),'Europe/Moscow'), auth.uid())
    RETURNING * INTO v_school;
    PERFORM public.driving_log(_organization_id, 'connect_module', v_school.id::text);
  END IF;
  RETURN jsonb_build_object('connected', true, 'school_id', v_school.id, 'name', v_school.name);
END; $$;

CREATE OR REPLACE FUNCTION public.driving_module_status(_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_connected boolean;
BEGIN
  IF NOT (public.driving_can_read(_organization_id) OR public.driving_is_member(_organization_id)) THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: нет доступа к модулю автошколы' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.driving_schools WHERE organization_id = _organization_id)
    INTO v_connected;
  RETURN jsonb_build_object('installed', true, 'connected', v_connected,
    'can_manage', public.driving_can_manage(_organization_id));
END; $$;

CREATE OR REPLACE FUNCTION public.driving_my_schools()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('organization_id', s.organization_id, 'name', s.name,
                              'role', m.role::text) AS x
    FROM public.driving_memberships m
    JOIN public.driving_schools s ON s.organization_id = m.organization_id
    WHERE m.user_id = auth.uid()) q;
$$;

GRANT EXECUTE ON FUNCTION public.driving_connect_module(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_module_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_my_schools() TO authenticated, service_role;

-- ───────────────── Состояние кабинета одним вызовом ─────────────────
CREATE OR REPLACE FUNCTION public.driving_get_state(_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_manage boolean := public.driving_can_manage(_organization_id);
  v_read boolean := public.driving_can_read(_organization_id);
  v_role text; v_student uuid; v_instructor uuid;
  v_school public.driving_schools;
BEGIN
  SELECT m.role::text, m.student_id, m.instructor_id INTO v_role, v_student, v_instructor
  FROM public.driving_membership(_organization_id) m;

  IF NOT v_read AND v_role IS NULL THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: нет доступа к этой автошколе' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_school FROM public.driving_schools WHERE organization_id = _organization_id;
  IF v_school.id IS NULL THEN
    RETURN jsonb_build_object('connected', false, 'can_manage', v_manage);
  END IF;

  RETURN jsonb_build_object(
    'connected', true,
    'can_manage', v_manage,
    'viewer', jsonb_build_object(
      'role', CASE WHEN v_manage THEN 'owner' ELSE COALESCE(v_role,'staff') END,
      'student_id', v_student, 'instructor_id', v_instructor),
    'school', jsonb_build_object(
      'organization_id', v_school.organization_id, 'name', v_school.name,
      'timezone', v_school.timezone, 'horizon_days', v_school.horizon_days,
      'cancel_hours', v_school.cancel_hours),
    'students', (
      SELECT COALESCE(jsonb_agg(to_jsonb(s) - 'user_id' ORDER BY s.name), '[]'::jsonb)
      FROM public.driving_students s
      WHERE s.organization_id = _organization_id AND (
        v_read OR (v_role = 'student' AND s.id = v_student)
        OR (v_role = 'instructor' AND s.instructor_id = v_instructor))),
    'programs', (
      SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.name), '[]'::jsonb)
      FROM public.driving_programs p WHERE p.organization_id = _organization_id),
    'groups', (
      SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.name), '[]'::jsonb)
      FROM public.driving_groups g WHERE g.organization_id = _organization_id),
    'cars', (
      SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.name), '[]'::jsonb)
      FROM public.driving_cars c WHERE c.organization_id = _organization_id),
    'instructors', (
      SELECT COALESCE(jsonb_agg(
        (to_jsonb(i) - 'user_id' - CASE WHEN v_read THEN '' ELSE 'email' END)
        || jsonb_build_object('shifts', (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', sh.id, 'starts_at', sh.starts_at, 'ends_at', sh.ends_at)
               ORDER BY sh.starts_at), '[]'::jsonb)
             FROM public.driving_shifts sh
             WHERE sh.organization_id = _organization_id AND sh.instructor_id = i.id))
        ORDER BY i.name), '[]'::jsonb)
      FROM public.driving_instructors i WHERE i.organization_id = _organization_id),
    'lessons', (
      SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.starts_at), '[]'::jsonb)
      FROM public.driving_lessons l
      WHERE l.organization_id = _organization_id AND (
        v_read OR (v_role = 'student' AND l.student_id = v_student)
        OR (v_role = 'instructor' AND l.instructor_id = v_instructor))),
    -- Ученику отдаётся только занятость его инструктора, без чужих имён.
    'busy', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'starts_at', l.starts_at, 'ends_at', l.ends_at)), '[]'::jsonb)
      FROM public.driving_lessons l
      WHERE v_role = 'student' AND l.organization_id = _organization_id
        AND l.status IN ('booked','completed')
        AND l.instructor_id = (SELECT s.instructor_id FROM public.driving_students s
                               WHERE s.organization_id = _organization_id AND s.id = v_student)),
    'courses', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'program_id', c.program_id, 'material', c.material,
        'pass_percent', c.pass_percent, 'lms_course_id', c.lms_course_id,
        'questions', CASE WHEN v_read THEN c.questions ELSE (
          SELECT COALESCE(jsonb_agg(q - 'correct'), '[]'::jsonb)
          FROM jsonb_array_elements(c.questions) q) END) ORDER BY c.name), '[]'::jsonb)
      FROM public.driving_courses c
      WHERE c.organization_id = _organization_id AND (
        v_read OR v_role = 'instructor'
        OR (v_role = 'student' AND c.program_id = (
              SELECT s.program_id FROM public.driving_students s
              WHERE s.organization_id = _organization_id AND s.id = v_student)))),
    'entries', (
      SELECT COALESCE(jsonb_agg(to_jsonb(e) || jsonb_build_object('reversal', (
          SELECT jsonb_build_object('reason', r.reason, 'created_at', r.created_at)
          FROM public.driving_entry_reversals r
          WHERE r.organization_id = _organization_id AND r.entry_id = e.id))
        ORDER BY e.created_at DESC), '[]'::jsonb)
      FROM public.driving_entries e
      WHERE e.organization_id = _organization_id AND (
        v_read OR (v_role = 'student' AND e.student_id = v_student)
        OR (v_role = 'instructor' AND e.kind IN ('exam','attempt') AND EXISTS (
              SELECT 1 FROM public.driving_students s
              WHERE s.organization_id = _organization_id AND s.id = e.student_id
                AND s.instructor_id = v_instructor)))),
    'balances', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id, 'planned', s.practice_minutes,
        'completed', m.completed, 'reserved', m.reserved)), '[]'::jsonb)
      FROM public.driving_students s
      CROSS JOIN LATERAL public.driving_student_minutes(_organization_id, s.id) m
      WHERE s.organization_id = _organization_id AND (
        v_read OR (v_role = 'student' AND s.id = v_student)
        OR (v_role = 'instructor' AND s.instructor_id = v_instructor))),
    'audit', CASE WHEN v_manage THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('action', a.action, 'target', a.target,
        'detail', a.detail, 'created_at', a.created_at) ORDER BY a.id DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.driving_audit WHERE organization_id = _organization_id
            ORDER BY id DESC LIMIT 100) a) ELSE '[]'::jsonb END);
END; $$;

GRANT EXECUTE ON FUNCTION public.driving_get_state(uuid) TO authenticated, service_role;

-- ───────────────── Справочники ─────────────────
CREATE OR REPLACE FUNCTION public.driving_save_program(
  _organization_id uuid, _name text, _version text, _transmission text, _practice_minutes integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF COALESCE(btrim(_name),'') = '' OR COALESCE(btrim(_version),'') = '' THEN
    RAISE EXCEPTION 'DRIVING_INVALID: заполните название и версию программы' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.driving_programs(organization_id, name, version, transmission, practice_minutes)
  VALUES (_organization_id, btrim(_name), btrim(_version),
    (CASE WHEN _transmission = 'AT' THEN 'AT' ELSE 'MT' END)::public.driving_transmission,
    _practice_minutes)
  RETURNING id INTO v_id;
  PERFORM public.driving_log(_organization_id, 'create_program', v_id::text);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.driving_save_car(
  _organization_id uuid, _name text, _number text, _transmission text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF COALESCE(btrim(_name),'') = '' OR COALESCE(btrim(_number),'') = '' THEN
    RAISE EXCEPTION 'DRIVING_INVALID: заполните название и госномер' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.driving_cars(organization_id, name, number, transmission)
  VALUES (_organization_id, btrim(_name), btrim(_number),
    (CASE WHEN _transmission = 'AT' THEN 'AT' ELSE 'MT' END)::public.driving_transmission)
  RETURNING id INTO v_id;
  PERFORM public.driving_log(_organization_id, 'create_car', v_id::text);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.driving_save_instructor(
  _organization_id uuid, _name text, _email text, _car_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF COALESCE(btrim(_name),'') = '' THEN
    RAISE EXCEPTION 'DRIVING_INVALID: укажите имя инструктора' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.driving_cars
                 WHERE organization_id = _organization_id AND id = _car_id) THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: автомобиль не найден в этой автошколе' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.driving_instructors(organization_id, name, email, car_id)
  VALUES (_organization_id, btrim(_name), NULLIF(btrim(lower(COALESCE(_email,''))),''), _car_id)
  RETURNING id INTO v_id;
  PERFORM public.driving_log(_organization_id, 'create_instructor', v_id::text);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.driving_save_group(
  _organization_id uuid, _name text, _program_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF NOT EXISTS (SELECT 1 FROM public.driving_programs
                 WHERE organization_id = _organization_id AND id = _program_id) THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: программа не найдена в этой автошколе' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.driving_groups(organization_id, name, program_id)
  VALUES (_organization_id, btrim(_name), _program_id) RETURNING id INTO v_id;
  PERFORM public.driving_log(_organization_id, 'create_group', v_id::text);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.driving_set_resource_status(
  _organization_id uuid, _kind text, _id uuid, _active boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF COALESCE(btrim(_reason),'') = '' THEN
    RAISE EXCEPTION 'DRIVING_INVALID: укажите причину' USING ERRCODE = '22023';
  END IF;
  IF _kind = 'student' THEN
    UPDATE public.driving_students SET active = _active
    WHERE organization_id = _organization_id AND id = _id;
  ELSIF _kind = 'instructor' THEN
    UPDATE public.driving_instructors SET active = _active
    WHERE organization_id = _organization_id AND id = _id;
  ELSIF _kind = 'car' THEN
    UPDATE public.driving_cars SET active = _active
    WHERE organization_id = _organization_id AND id = _id;
  ELSE
    RAISE EXCEPTION 'DRIVING_INVALID: статус не изменяется для этого типа' USING ERRCODE = '22023';
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: запись не найдена' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.driving_log(_organization_id, 'availability', _id::text,
    jsonb_build_object('active', _active, 'reason', _reason, 'kind', _kind));
END; $$;

CREATE OR REPLACE FUNCTION public.driving_add_shift(
  _organization_id uuid, _instructor_id uuid, _starts_at timestamptz, _ends_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF _ends_at <= _starts_at OR _ends_at - _starts_at > interval '24 hours' THEN
    RAISE EXCEPTION 'DRIVING_INVALID: проверьте начало и конец смены (до 24 часов)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.driving_instructors
                 WHERE organization_id = _organization_id AND id = _instructor_id) THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: инструктор не найден' USING ERRCODE = 'P0002';
  END IF;
  -- Сериализация конкурентных записей по школе: одновременные вставки
  -- не могут создать пересекающиеся интервалы.
  PERFORM pg_advisory_xact_lock(hashtextextended('driving:' || _organization_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.driving_shifts s
             WHERE s.organization_id = _organization_id AND s.instructor_id = _instructor_id
               AND s.starts_at < _ends_at AND _starts_at < s.ends_at) THEN
    RAISE EXCEPTION 'DRIVING_CONFLICT: смена пересекается с существующей' USING ERRCODE = '23P01';
  END IF;
  INSERT INTO public.driving_shifts(organization_id, instructor_id, starts_at, ends_at)
  VALUES (_organization_id, _instructor_id, _starts_at, _ends_at) RETURNING id INTO v_id;
  PERFORM public.driving_log(_organization_id, 'add_shift', _instructor_id::text,
    jsonb_build_object('starts_at', _starts_at, 'ends_at', _ends_at));
  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.driving_save_program(uuid, text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_save_car(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_save_instructor(uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_save_group(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_set_resource_status(uuid, text, uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_add_shift(uuid, uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- ───────────────── Ученики ─────────────────
CREATE OR REPLACE FUNCTION public.driving_save_student(
  _organization_id uuid, _name text, _email text, _phone text, _program_id uuid,
  _group_id uuid DEFAULT NULL, _instructor_id uuid DEFAULT NULL, _user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_program public.driving_programs; v_group public.driving_groups;
  v_instructor public.driving_instructors; v_car public.driving_cars; v_id uuid;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF COALESCE(btrim(_name),'') = '' THEN
    RAISE EXCEPTION 'DRIVING_INVALID: укажите ФИО ученика' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_program FROM public.driving_programs
  WHERE organization_id = _organization_id AND id = _program_id;
  IF v_program.id IS NULL THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: программа не найдена в этой автошколе' USING ERRCODE = 'P0002';
  END IF;
  IF _group_id IS NOT NULL THEN
    SELECT * INTO v_group FROM public.driving_groups
    WHERE organization_id = _organization_id AND id = _group_id;
    IF v_group.id IS NULL THEN
      RAISE EXCEPTION 'DRIVING_NOT_FOUND: группа не найдена' USING ERRCODE = 'P0002';
    END IF;
    IF v_group.program_id <> v_program.id THEN
      RAISE EXCEPTION 'DRIVING_INVALID: программа группы не совпадает' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _instructor_id IS NOT NULL THEN
    SELECT * INTO v_instructor FROM public.driving_instructors
    WHERE organization_id = _organization_id AND id = _instructor_id;
    IF v_instructor.id IS NULL THEN
      RAISE EXCEPTION 'DRIVING_NOT_FOUND: инструктор не найден' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_car FROM public.driving_cars
    WHERE organization_id = _organization_id AND id = v_instructor.car_id;
    IF v_car.transmission <> v_program.transmission THEN
      RAISE EXCEPTION 'DRIVING_INVALID: трансмиссия инструктора не совпадает с программой' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p
                   WHERE p.user_id = _user_id AND p.organization_id = _organization_id) THEN
      RAISE EXCEPTION 'DRIVING_FORBIDDEN: аккаунт не принадлежит этой организации' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.driving_students
               WHERE organization_id = _organization_id AND user_id = _user_id) THEN
      RAISE EXCEPTION 'DRIVING_CONFLICT: этот аккаунт уже связан с учеником автошколы' USING ERRCODE = '23505';
    END IF;
  END IF;
  INSERT INTO public.driving_students(organization_id, name, email, phone, user_id,
    program_id, group_id, instructor_id, practice_minutes, transmission)
  VALUES (_organization_id, btrim(_name),
    NULLIF(btrim(lower(COALESCE(_email,''))),''), NULLIF(btrim(COALESCE(_phone,'')),''),
    _user_id, v_program.id, _group_id, _instructor_id,
    v_program.practice_minutes, v_program.transmission)
  RETURNING id INTO v_id;
  IF _user_id IS NOT NULL THEN
    INSERT INTO public.driving_memberships(organization_id, user_id, role, student_id)
    VALUES (_organization_id, _user_id, 'student', v_id)
    ON CONFLICT (organization_id, user_id, role)
      DO UPDATE SET student_id = EXCLUDED.student_id, updated_at = now();
  END IF;
  PERFORM public.driving_log(_organization_id, 'create_student', v_id::text,
    jsonb_build_object('linked_account', _user_id IS NOT NULL));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.driving_link_student_account(
  _organization_id uuid, _student_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = _user_id AND p.organization_id = _organization_id) THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: аккаунт не принадлежит этой организации' USING ERRCODE = '42501';
  END IF;
  UPDATE public.driving_students SET user_id = _user_id
  WHERE organization_id = _organization_id AND id = _student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: ученик не найден' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.driving_memberships(organization_id, user_id, role, student_id)
  VALUES (_organization_id, _user_id, 'student', _student_id)
  ON CONFLICT (organization_id, user_id, role)
    DO UPDATE SET student_id = EXCLUDED.student_id, updated_at = now();
  PERFORM public.driving_log(_organization_id, 'link_student_account', _student_id::text);
END; $$;

CREATE OR REPLACE FUNCTION public.driving_assign_student(
  _organization_id uuid, _student_id uuid, _instructor_id uuid, _group_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student public.driving_students; v_instructor public.driving_instructors;
  v_car public.driving_cars; v_group public.driving_groups;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  SELECT * INTO v_student FROM public.driving_students
  WHERE organization_id = _organization_id AND id = _student_id;
  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: ученик не найден' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_instructor FROM public.driving_instructors
  WHERE organization_id = _organization_id AND id = _instructor_id;
  IF v_instructor.id IS NULL THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: инструктор не найден' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_car FROM public.driving_cars
  WHERE organization_id = _organization_id AND id = v_instructor.car_id;
  IF v_car.transmission <> v_student.transmission THEN
    RAISE EXCEPTION 'DRIVING_INVALID: трансмиссии не совпадают' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.driving_lessons
             WHERE organization_id = _organization_id AND student_id = _student_id
               AND status = 'booked') THEN
    RAISE EXCEPTION 'DRIVING_CONFLICT: сначала отмените или проведите существующие записи' USING ERRCODE = '23P01';
  END IF;
  IF _group_id IS NOT NULL THEN
    SELECT * INTO v_group FROM public.driving_groups
    WHERE organization_id = _organization_id AND id = _group_id;
    IF v_group.id IS NULL OR v_group.program_id <> v_student.program_id THEN
      RAISE EXCEPTION 'DRIVING_INVALID: программа группы не совпадает' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE public.driving_students
  SET instructor_id = _instructor_id, group_id = COALESCE(_group_id, group_id)
  WHERE organization_id = _organization_id AND id = _student_id;
  PERFORM public.driving_log(_organization_id, 'assign_student', _student_id::text,
    jsonb_build_object('instructor_id', _instructor_id, 'group_id', _group_id));
END; $$;

GRANT EXECUTE ON FUNCTION public.driving_save_student(uuid, text, text, text, uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_link_student_account(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_assign_student(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- ───────────────── Приглашения в кабинет ─────────────────
CREATE OR REPLACE FUNCTION public.driving_create_invite(
  _organization_id uuid, _role text, _target_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text := encode(extensions.gen_random_bytes(32), 'hex'); v_email text; v_found boolean;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF _role NOT IN ('student','instructor') THEN
    RAISE EXCEPTION 'DRIVING_INVALID: приглашение только для ученика или инструктора' USING ERRCODE = '22023';
  END IF;
  IF _role = 'instructor' THEN
    SELECT email, true INTO v_email, v_found FROM public.driving_instructors
    WHERE organization_id = _organization_id AND id = _target_id;
  ELSE
    SELECT email, true INTO v_email, v_found FROM public.driving_students
    WHERE organization_id = _organization_id AND id = _target_id;
  END IF;
  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: запись не найдена в этой автошколе' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.driving_invites SET used_at = now()
  WHERE organization_id = _organization_id AND role = _role::public.driving_member_role
    AND COALESCE(student_id, instructor_id) = _target_id AND used_at IS NULL;
  INSERT INTO public.driving_invites(organization_id, token_hash, role, student_id,
    instructor_id, email, expires_at, created_by)
  VALUES (_organization_id,
    encode(extensions.digest(v_token::bytea, 'sha256'::text), 'hex'),
    _role::public.driving_member_role,
    CASE WHEN _role = 'student' THEN _target_id END,
    CASE WHEN _role = 'instructor' THEN _target_id END,
    v_email, now() + interval '72 hours', auth.uid());
  PERFORM public.driving_log(_organization_id, 'invite', _target_id::text,
    jsonb_build_object('role', _role));
  RETURN jsonb_build_object('token', v_token, 'email', v_email, 'expires_in_hours', 72);
END; $$;

CREATE OR REPLACE FUNCTION public.driving_accept_invite(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invite public.driving_invites;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'DRIVING_UNAUTHENTICATED: войдите в СИНТАГМУ' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_invite FROM public.driving_invites
  WHERE token_hash = encode(extensions.digest(COALESCE(_token,'')::bytea, 'sha256'::text), 'hex')
    AND used_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: приглашение истекло или уже использовано' USING ERRCODE = 'P0002';
  END IF;
  IF v_invite.role = 'student' THEN
    UPDATE public.driving_students SET user_id = auth.uid()
    WHERE organization_id = v_invite.organization_id AND id = v_invite.student_id;
    INSERT INTO public.driving_memberships(organization_id, user_id, role, student_id)
    VALUES (v_invite.organization_id, auth.uid(), 'student', v_invite.student_id)
    ON CONFLICT (organization_id, user_id, role)
      DO UPDATE SET student_id = EXCLUDED.student_id, updated_at = now();
  ELSE
    UPDATE public.driving_instructors SET user_id = auth.uid()
    WHERE organization_id = v_invite.organization_id AND id = v_invite.instructor_id;
    INSERT INTO public.driving_memberships(organization_id, user_id, role, instructor_id)
    VALUES (v_invite.organization_id, auth.uid(), 'instructor', v_invite.instructor_id)
    ON CONFLICT (organization_id, user_id, role)
      DO UPDATE SET instructor_id = EXCLUDED.instructor_id, updated_at = now();
  END IF;
  UPDATE public.driving_invites SET used_at = now(), used_by = auth.uid() WHERE id = v_invite.id;
  PERFORM public.driving_log(v_invite.organization_id, 'accept_invite',
    COALESCE(v_invite.student_id, v_invite.instructor_id)::text,
    jsonb_build_object('role', v_invite.role));
  RETURN jsonb_build_object('organization_id', v_invite.organization_id,
                            'role', v_invite.role::text);
END; $$;

GRANT EXECUTE ON FUNCTION public.driving_create_invite(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_accept_invite(text) TO authenticated, service_role;

-- ───────────────── Запись на практику ─────────────────
CREATE OR REPLACE FUNCTION public.driving_book_lesson(
  _organization_id uuid, _student_id uuid, _instructor_id uuid, _car_id uuid,
  _starts_at timestamptz, _ends_at timestamptz, _lesson_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_manage boolean := public.driving_can_manage(_organization_id);
  v_role text; v_member_student uuid; v_member_instructor uuid;
  v_student public.driving_students; v_instructor public.driving_instructors;
  v_car public.driving_cars; v_school public.driving_schools;
  v_minutes integer := (EXTRACT(EPOCH FROM (_ends_at - _starts_at))::integer)/60;
  v_totals record; v_id uuid;
BEGIN
  SELECT m.role::text, m.student_id, m.instructor_id
    INTO v_role, v_member_student, v_member_instructor
  FROM public.driving_membership(_organization_id) m;

  IF NOT v_manage AND v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: запись выполняет ученик или администратор' USING ERRCODE = '42501';
  END IF;
  IF NOT v_manage AND v_member_student IS DISTINCT FROM _student_id THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: нет доступа к этому ученику' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_school FROM public.driving_schools WHERE organization_id = _organization_id;
  IF v_school.id IS NULL THEN
    RAISE EXCEPTION 'DRIVING_NOT_CONNECTED: модуль автошколы ещё не подключён' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_student FROM public.driving_students
  WHERE organization_id = _organization_id AND id = _student_id;
  SELECT * INTO v_instructor FROM public.driving_instructors
  WHERE organization_id = _organization_id AND id = _instructor_id;
  SELECT * INTO v_car FROM public.driving_cars
  WHERE organization_id = _organization_id AND id = _car_id;
  IF v_student.id IS NULL OR v_instructor.id IS NULL OR v_car.id IS NULL THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: ученик, инструктор или автомобиль не найден' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_student.active AND v_instructor.active AND v_car.active) THEN
    RAISE EXCEPTION 'DRIVING_INVALID: ученик, инструктор или автомобиль недоступен' USING ERRCODE = '22023';
  END IF;
  IF v_student.instructor_id IS DISTINCT FROM v_instructor.id THEN
    RAISE EXCEPTION 'DRIVING_INVALID: ученик не закреплён за этим инструктором' USING ERRCODE = '22023';
  END IF;
  IF v_instructor.car_id IS DISTINCT FROM v_car.id
     OR v_student.transmission <> v_car.transmission THEN
    RAISE EXCEPTION 'DRIVING_INVALID: автомобиль не соответствует назначению или программе' USING ERRCODE = '22023';
  END IF;
  IF v_minutes < 30 OR v_minutes > 180
     OR (v_minutes * 60) <> EXTRACT(EPOCH FROM (_ends_at - _starts_at))::integer THEN
    RAISE EXCEPTION 'DRIVING_INVALID: занятие должно длиться 30–180 минут целыми минутами' USING ERRCODE = '22023';
  END IF;
  IF _starts_at < now() THEN
    RAISE EXCEPTION 'DRIVING_INVALID: занятие нельзя записать в прошлое' USING ERRCODE = '22023';
  END IF;
  IF _starts_at > now() + make_interval(days => v_school.horizon_days) THEN
    RAISE EXCEPTION 'DRIVING_INVALID: дата за пределами горизонта записи' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.driving_shifts s
                 WHERE s.organization_id = _organization_id AND s.instructor_id = v_instructor.id
                   AND s.starts_at <= _starts_at AND _ends_at <= s.ends_at) THEN
    RAISE EXCEPTION 'DRIVING_INVALID: у инструктора нет рабочей смены на это время' USING ERRCODE = '22023';
  END IF;

  -- Одна очередь на школу: параллельные записи не могут пересечься.
  PERFORM pg_advisory_xact_lock(hashtextextended('driving:' || _organization_id::text, 0));

  SELECT * INTO v_totals
  FROM public.driving_student_minutes(_organization_id, v_student.id, _lesson_id);
  IF v_totals.completed + v_totals.reserved + v_minutes > v_student.practice_minutes THEN
    RAISE EXCEPTION 'DRIVING_INVALID: не хватает свободных минут практики' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.driving_lessons l
    WHERE l.organization_id = _organization_id AND l.status = 'booked'
      AND (_lesson_id IS NULL OR l.id <> _lesson_id)
      AND l.starts_at < _ends_at AND _starts_at < l.ends_at
      AND (l.student_id = v_student.id OR l.instructor_id = v_instructor.id
           OR l.car_id = v_car.id)) THEN
    RAISE EXCEPTION 'DRIVING_CONFLICT: это время уже занято у ученика, инструктора или автомобиля'
      USING ERRCODE = '23P01';
  END IF;

  IF _lesson_id IS NOT NULL THEN
    UPDATE public.driving_lessons
    SET starts_at = _starts_at, ends_at = _ends_at, instructor_id = v_instructor.id,
        car_id = v_car.id, revision = revision + 1
    WHERE organization_id = _organization_id AND id = _lesson_id AND status = 'booked';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DRIVING_INVALID: изменить можно только запланированное занятие' USING ERRCODE = '22023';
    END IF;
    v_id := _lesson_id;
  ELSE
    INSERT INTO public.driving_lessons(organization_id, student_id, instructor_id, car_id,
      starts_at, ends_at, created_by)
    VALUES (_organization_id, v_student.id, v_instructor.id, v_car.id,
      _starts_at, _ends_at, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.driving_log(_organization_id,
    CASE WHEN _lesson_id IS NULL THEN 'book_lesson' ELSE 'reschedule' END, v_id::text,
    jsonb_build_object('starts_at', _starts_at, 'ends_at', _ends_at));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.driving_lesson_action(
  _organization_id uuid, _lesson_id uuid, _action text,
  _actual_minutes integer DEFAULT NULL, _topic text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_manage boolean := public.driving_can_manage(_organization_id);
  v_role text; v_member_student uuid; v_member_instructor uuid;
  v_lesson public.driving_lessons; v_school public.driving_schools;
  v_student public.driving_students; v_totals record;
  v_actual integer := 0; v_planned integer;
BEGIN
  SELECT m.role::text, m.student_id, m.instructor_id
    INTO v_role, v_member_student, v_member_instructor
  FROM public.driving_membership(_organization_id) m;

  SELECT * INTO v_lesson FROM public.driving_lessons
  WHERE organization_id = _organization_id AND id = _lesson_id FOR UPDATE;
  IF v_lesson.id IS NULL THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: занятие не найдено' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_manage THEN
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'DRIVING_FORBIDDEN: нет доступа' USING ERRCODE = '42501';
    END IF;
    IF v_role = 'student' AND v_lesson.student_id IS DISTINCT FROM v_member_student THEN
      RAISE EXCEPTION 'DRIVING_FORBIDDEN: нет доступа' USING ERRCODE = '42501';
    END IF;
    IF v_role = 'instructor' AND v_lesson.instructor_id IS DISTINCT FROM v_member_instructor THEN
      RAISE EXCEPTION 'DRIVING_FORBIDDEN: нет доступа' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_school FROM public.driving_schools WHERE organization_id = _organization_id;
  v_planned := (EXTRACT(EPOCH FROM (v_lesson.ends_at - v_lesson.starts_at))::integer)/60;

  IF _action = 'cancel' THEN
    IF NOT v_manage AND v_role <> 'student' THEN
      RAISE EXCEPTION 'DRIVING_FORBIDDEN: отмену выполняет администратор или ученик' USING ERRCODE = '42501';
    END IF;
    IF v_lesson.status = 'cancelled' THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true);
    END IF;
    IF v_lesson.status <> 'booked' THEN
      RAISE EXCEPTION 'DRIVING_INVALID: изменить можно только запланированное занятие' USING ERRCODE = '22023';
    END IF;
    IF NOT v_manage
       AND v_lesson.starts_at - now() < make_interval(hours => v_school.cancel_hours) THEN
      RAISE EXCEPTION 'DRIVING_INVALID: срок самостоятельной отмены истёк, обратитесь к администратору' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(_reason),'') = '' THEN
      RAISE EXCEPTION 'DRIVING_INVALID: укажите причину отмены' USING ERRCODE = '22023';
    END IF;
    UPDATE public.driving_lessons
    SET status = 'cancelled', note = btrim(_reason), revision = revision + 1
    WHERE id = v_lesson.id;

  ELSIF _action IN ('complete','no_show','correct') THEN
    IF NOT v_manage AND v_role <> 'instructor' THEN
      RAISE EXCEPTION 'DRIVING_FORBIDDEN: подтверждает инструктор или администратор' USING ERRCODE = '42501';
    END IF;
    IF _action = 'complete' AND v_lesson.status = 'completed' THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true);
    END IF;
    IF _action = 'correct' THEN
      IF NOT v_manage THEN
        RAISE EXCEPTION 'DRIVING_FORBIDDEN: исправление доступно администратору' USING ERRCODE = '42501';
      END IF;
      IF v_lesson.status <> 'completed' THEN
        RAISE EXCEPTION 'DRIVING_INVALID: исправить можно проведённое занятие' USING ERRCODE = '22023';
      END IF;
      IF COALESCE(btrim(_reason),'') = '' THEN
        RAISE EXCEPTION 'DRIVING_INVALID: укажите причину исправления' USING ERRCODE = '22023';
      END IF;
    ELSIF v_lesson.status <> 'booked' THEN
      RAISE EXCEPTION 'DRIVING_INVALID: занятие уже закрыто' USING ERRCODE = '22023';
    END IF;
    IF v_lesson.ends_at > now() THEN
      RAISE EXCEPTION 'DRIVING_INVALID: подтвердите занятие после его окончания' USING ERRCODE = '22023';
    END IF;

    v_actual := CASE WHEN _action = 'no_show' THEN 0 ELSE COALESCE(_actual_minutes, 0) END;
    IF _action <> 'no_show' AND (v_actual < 1 OR v_actual > v_planned) THEN
      RAISE EXCEPTION 'DRIVING_INVALID: фактические минуты должны быть от 1 до %', v_planned
        USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_student FROM public.driving_students
    WHERE organization_id = _organization_id AND id = v_lesson.student_id;
    SELECT * INTO v_totals
    FROM public.driving_student_minutes(_organization_id, v_lesson.student_id, v_lesson.id);
    IF v_totals.completed + v_totals.reserved + v_actual > v_student.practice_minutes THEN
      RAISE EXCEPTION 'DRIVING_INVALID: значение превысит план практики с учётом забронированных занятий' USING ERRCODE = '22023';
    END IF;

    UPDATE public.driving_lessons
    SET status = (CASE WHEN _action = 'no_show' THEN 'no_show' ELSE 'completed' END)::public.driving_lesson_status,
        actual_minutes = v_actual,
        topic = CASE WHEN _action = 'no_show' THEN 'Неявка'
                     ELSE COALESCE(NULLIF(btrim(COALESCE(_topic,'')),''), topic) END,
        note = LEFT(COALESCE(_reason, note), 2000),
        confirmed_by = auth.uid(), confirmed_at = now(), revision = revision + 1
    WHERE id = v_lesson.id;
  ELSE
    RAISE EXCEPTION 'DRIVING_INVALID: неизвестное действие' USING ERRCODE = '22023';
  END IF;

  PERFORM public.driving_log(_organization_id, _action, v_lesson.id::text, jsonb_build_object(
    'before', to_jsonb(v_lesson), 'reason', COALESCE(_reason,''), 'actual_minutes', v_actual));
  RETURN jsonb_build_object('ok', true);
END; $$;

GRANT EXECUTE ON FUNCTION public.driving_book_lesson(uuid, uuid, uuid, uuid, timestamptz, timestamptz, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_lesson_action(uuid, uuid, text, integer, text, text) TO authenticated, service_role;

-- ───────────────── Финансы и экзамены (идемпотентно) ─────────────────
CREATE OR REPLACE FUNCTION public.driving_add_entry(
  _organization_id uuid, _operation_id text, _student_id uuid, _kind text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hash text; v_previous public.driving_operations; v_data jsonb; v_id uuid;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF COALESCE(btrim(_operation_id),'') = '' THEN
    RAISE EXCEPTION 'DRIVING_INVALID: нужен ключ операции' USING ERRCODE = '22023';
  END IF;
  v_hash := encode(extensions.digest(
    (_student_id::text || ':' || _kind || ':' || COALESCE(_payload::text,''))::bytea,
    'sha256'::text), 'hex');

  SELECT * INTO v_previous FROM public.driving_operations
  WHERE organization_id = _organization_id AND operation_id = btrim(_operation_id);
  IF v_previous.operation_id IS NOT NULL THEN
    IF v_previous.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'DRIVING_CONFLICT: ключ операции уже использован для других данных' USING ERRCODE = '23505';
    END IF;
    RETURN v_previous.result;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.driving_students
                 WHERE organization_id = _organization_id AND id = _student_id) THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: ученик не найден' USING ERRCODE = 'P0002';
  END IF;

  IF _kind IN ('charge','payment') THEN
    IF COALESCE((_payload->>'kopecks')::bigint, 0) < 1
       OR (_payload->>'kopecks')::bigint > 100000000
       OR COALESCE(btrim(_payload->>'note'),'') = ''
       OR COALESCE(btrim(_payload->>'date'),'') = '' THEN
      RAISE EXCEPTION 'DRIVING_INVALID: проверьте сумму, дату и основание' USING ERRCODE = '22023';
    END IF;
    v_data := jsonb_build_object('kopecks', (_payload->>'kopecks')::bigint,
      'note', btrim(_payload->>'note'), 'date', btrim(_payload->>'date'));
  ELSIF _kind = 'exam' THEN
    IF (_payload->>'exam_type') NOT IN ('internal','external')
       OR (_payload->>'result') NOT IN ('passed','failed')
       OR COALESCE(btrim(_payload->>'protocol'),'') = ''
       OR COALESCE(btrim(_payload->>'date'),'') = '' THEN
      RAISE EXCEPTION 'DRIVING_INVALID: проверьте данные экзамена' USING ERRCODE = '22023';
    END IF;
    v_data := jsonb_build_object('exam_type', _payload->>'exam_type',
      'result', _payload->>'result', 'date', btrim(_payload->>'date'),
      'protocol', btrim(_payload->>'protocol'),
      'note', LEFT(COALESCE(_payload->>'note',''), 2000));
  ELSE
    RAISE EXCEPTION 'DRIVING_INVALID: неизвестная запись' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.driving_entries(organization_id, student_id, kind, data, created_by)
  VALUES (_organization_id, _student_id, _kind::public.driving_entry_kind, v_data, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.driving_operations(organization_id, operation_id, payload_hash, result)
  VALUES (_organization_id, btrim(_operation_id), v_hash, jsonb_build_object('id', v_id));

  PERFORM public.driving_log(_organization_id, 'add_' || _kind, v_id::text, v_data);
  RETURN jsonb_build_object('id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.driving_reverse_entry(
  _organization_id uuid, _entry_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry public.driving_entries;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF COALESCE(btrim(_reason),'') = '' THEN
    RAISE EXCEPTION 'DRIVING_INVALID: укажите причину исправления' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_entry FROM public.driving_entries
  WHERE organization_id = _organization_id AND id = _entry_id;
  IF v_entry.id IS NULL OR v_entry.kind NOT IN ('charge','payment') THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: финансовая запись не найдена' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.driving_entry_reversals WHERE entry_id = _entry_id) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  INSERT INTO public.driving_entry_reversals(entry_id, organization_id, reason, created_by)
  VALUES (_entry_id, _organization_id, btrim(_reason), auth.uid());
  PERFORM public.driving_log(_organization_id, 'reverse_' || v_entry.kind::text, _entry_id::text,
    jsonb_build_object('reason', btrim(_reason), 'original', v_entry.data));
  RETURN jsonb_build_object('ok', true);
END; $$;

GRANT EXECUTE ON FUNCTION public.driving_add_entry(uuid, text, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_reverse_entry(uuid, uuid, text) TO authenticated, service_role;

-- ───────────────── Теория и серверная проверка теста ─────────────────
CREATE OR REPLACE FUNCTION public.driving_save_course(
  _organization_id uuid, _program_id uuid, _name text, _material text,
  _pass_percent integer, _questions jsonb, _lms_course_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_count integer;
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF NOT EXISTS (SELECT 1 FROM public.driving_programs
                 WHERE organization_id = _organization_id AND id = _program_id) THEN
    RAISE EXCEPTION 'DRIVING_NOT_FOUND: программа не найдена' USING ERRCODE = 'P0002';
  END IF;
  v_count := COALESCE(jsonb_array_length(_questions), 0);
  IF v_count < 1 OR v_count > 50 THEN
    RAISE EXCEPTION 'DRIVING_INVALID: добавьте от 1 до 50 вопросов' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_questions) q
    WHERE COALESCE(btrim(q->>'text'),'') = ''
       OR COALESCE(jsonb_array_length(q->'options'), 0) < 2
       OR (q->>'correct') IS NULL
       OR (q->>'correct')::integer < 0
       OR (q->>'correct')::integer >= jsonb_array_length(q->'options')) THEN
    RAISE EXCEPTION 'DRIVING_INVALID: проверьте формулировки вопросов и верные ответы' USING ERRCODE = '22023';
  END IF;
  IF _lms_course_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = _lms_course_id AND c.organization_id = _organization_id) THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: курс принадлежит другой организации' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.driving_courses(organization_id, program_id, name, material,
    pass_percent, questions, lms_course_id)
  VALUES (_organization_id, _program_id, btrim(_name), COALESCE(_material,''),
    COALESCE(_pass_percent, 100), _questions, _lms_course_id)
  RETURNING id INTO v_id;
  PERFORM public.driving_log(_organization_id, 'create_course', v_id::text);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.driving_submit_attempt(
  _organization_id uuid, _course_id uuid, _answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text; v_student_id uuid; v_student public.driving_students;
  v_course public.driving_courses; v_total integer; v_correct integer;
  v_score integer; v_passed boolean; v_id uuid; v_data jsonb;
BEGIN
  SELECT m.role::text, m.student_id INTO v_role, v_student_id
  FROM public.driving_membership(_organization_id) m;
  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: тест проходит ученик автошколы' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_student FROM public.driving_students
  WHERE organization_id = _organization_id AND id = v_student_id;
  SELECT * INTO v_course FROM public.driving_courses
  WHERE organization_id = _organization_id AND id = _course_id;
  IF v_course.id IS NULL OR v_course.program_id <> v_student.program_id THEN
    RAISE EXCEPTION 'DRIVING_FORBIDDEN: этот курс не назначен' USING ERRCODE = '42501';
  END IF;
  v_total := jsonb_array_length(v_course.questions);
  IF COALESCE(jsonb_array_length(_answers), -1) <> v_total THEN
    RAISE EXCEPTION 'DRIVING_INVALID: ответьте на все вопросы' USING ERRCODE = '22023';
  END IF;
  SELECT COUNT(*)::integer INTO v_correct
  FROM jsonb_array_elements(v_course.questions) WITH ORDINALITY AS q(item, ord)
  WHERE (q.item->>'correct')::integer = (_answers->>((q.ord - 1)::integer))::integer;
  v_score := ROUND((v_correct::numeric / v_total) * 100)::integer;
  v_passed := v_score >= v_course.pass_percent;
  v_data := jsonb_build_object('course_id', v_course.id, 'course_name', v_course.name,
    'score', v_score, 'passed', v_passed, 'answers', _answers);
  INSERT INTO public.driving_entries(organization_id, student_id, kind, data, created_by)
  VALUES (_organization_id, v_student.id, 'attempt', v_data, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.driving_log(_organization_id, 'test_attempt', v_id::text,
    jsonb_build_object('score', v_score, 'passed', v_passed));
  -- Верные ответы клиенту не возвращаются, только итог.
  RETURN jsonb_build_object('id', v_id, 'score', v_score, 'passed', v_passed);
END; $$;

GRANT EXECUTE ON FUNCTION public.driving_save_course(uuid, uuid, text, text, integer, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driving_submit_attempt(uuid, uuid, jsonb) TO authenticated, service_role;

-- ───────────────── Настройки школы ─────────────────
CREATE OR REPLACE FUNCTION public.driving_save_settings(
  _organization_id uuid, _name text, _timezone text,
  _horizon_days integer, _cancel_hours integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.driving_assert_manage(_organization_id);
  IF COALESCE(btrim(_name),'') = '' THEN
    RAISE EXCEPTION 'DRIVING_INVALID: укажите название' USING ERRCODE = '22023';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE _timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'DRIVING_INVALID: неизвестный часовой пояс' USING ERRCODE = '22023';
  END;
  UPDATE public.driving_schools
  SET name = btrim(_name), timezone = _timezone,
      horizon_days = _horizon_days, cancel_hours = _cancel_hours
  WHERE organization_id = _organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DRIVING_NOT_CONNECTED: модуль автошколы ещё не подключён' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.driving_log(_organization_id, 'settings', _organization_id::text,
    jsonb_build_object('timezone', _timezone, 'horizon_days', _horizon_days,
                       'cancel_hours', _cancel_hours));
END; $$;

GRANT EXECUTE ON FUNCTION public.driving_save_settings(uuid, text, text, integer, integer) TO authenticated, service_role;