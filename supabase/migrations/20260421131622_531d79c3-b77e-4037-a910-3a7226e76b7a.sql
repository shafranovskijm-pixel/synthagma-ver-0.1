-- 1) Таблица истории версий лендинга
CREATE TABLE IF NOT EXISTS public.course_landing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  source text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_landing_history_course_created
  ON public.course_landing_history(course_id, created_at DESC);

ALTER TABLE public.course_landing_history ENABLE ROW LEVEL SECURITY;

-- Политики: владельцы организации курса + админы могут читать/удалять
CREATE POLICY "Org owners read landing history"
ON public.course_landing_history
FOR SELECT
TO authenticated
USING (
  organization_id = public.current_organization_id()
  OR public.has_role('admin'::public.app_role, auth.uid())
);

CREATE POLICY "Org owners delete landing history"
ON public.course_landing_history
FOR DELETE
TO authenticated
USING (
  organization_id = public.current_organization_id()
  OR public.has_role('admin'::public.app_role, auth.uid())
);

-- INSERT происходит только из триггера (SECURITY DEFINER), но разрешим явно для админов
CREATE POLICY "Admins insert landing history"
ON public.course_landing_history
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role('admin'::public.app_role, auth.uid())
  OR organization_id = public.current_organization_id()
);

-- 2) Триггерная функция: перед UPDATE сохраняем старое landing_content + усечение до 10
CREATE OR REPLACE FUNCTION public.snapshot_course_landing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
  v_keep_ids uuid[];
BEGIN
  -- Сохраняем только если landing_content фактически изменился и старый не пуст
  IF TG_OP = 'UPDATE'
     AND OLD.landing_content IS DISTINCT FROM NEW.landing_content
     AND OLD.landing_content IS NOT NULL
     AND jsonb_typeof(OLD.landing_content) = 'object' THEN

    -- Источник: пытаемся вытащить applied_template_id из НОВОГО content
    v_source := COALESCE(
      'template:' || (NEW.landing_content->>'applied_template_id'),
      'manual'
    );

    INSERT INTO public.course_landing_history (course_id, organization_id, snapshot, source, created_by)
    VALUES (NEW.id, NEW.organization_id, OLD.landing_content, v_source, auth.uid());

    -- Усечение до 10 последних версий на курс
    SELECT array_agg(id) INTO v_keep_ids
    FROM (
      SELECT id FROM public.course_landing_history
      WHERE course_id = NEW.id
      ORDER BY created_at DESC
      LIMIT 10
    ) keep;

    DELETE FROM public.course_landing_history
    WHERE course_id = NEW.id
      AND (v_keep_ids IS NULL OR NOT (id = ANY(v_keep_ids)));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_course_landing ON public.courses;
CREATE TRIGGER trg_snapshot_course_landing
BEFORE UPDATE OF landing_content ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_course_landing();

-- 3) RPC: проверка совместимости тарифа с уровнем шаблона
CREATE OR REPLACE FUNCTION public.can_use_template(p_plan text, p_tier text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_tier IS NULL OR p_tier = 'free' THEN true
    WHEN p_tier = 'pro' THEN p_plan IN ('start','standard','professional','maximum')
    WHEN p_tier = 'premium' THEN p_plan IN ('professional','maximum')
    ELSE true
  END;
$$;