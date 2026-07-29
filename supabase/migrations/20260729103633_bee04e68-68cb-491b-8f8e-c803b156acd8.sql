
-- 1. Trigger function
CREATE OR REPLACE FUNCTION public.create_org_course_completion_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_course_title text;
  v_student_name text;
BEGIN
  -- Fire only when transitioning INTO 'completed'.
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT c.organization_id, c.title
    INTO v_org_id, v_course_title
  FROM public.courses c
  WHERE c.id = NEW.course_id;

  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Ученик')
    INTO v_student_name
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id
    AND p.organization_id = v_org_id
  LIMIT 1;

  IF v_student_name IS NULL THEN
    v_student_name := 'Ученик';
  END IF;

  INSERT INTO public.org_notifications (
    organization_id, user_id, type, title, message, related_id, is_read
  )
  VALUES (
    v_org_id,
    NEW.user_id,
    'course_completed',
    'Ученик завершил курс',
    v_student_name || ' завершил(а) курс «' || COALESCE(v_course_title, 'без названия') || '»',
    NEW.course_id,
    false
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_org_course_completion_notification() FROM PUBLIC, anon, authenticated;

-- 2. Partial unique index (safe: diagnostics showed 0 duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS org_notifications_course_completed_unique
  ON public.org_notifications (organization_id, user_id, type, related_id)
  WHERE type = 'course_completed' AND related_id IS NOT NULL;

-- 3. Trigger
DROP TRIGGER IF EXISTS trg_org_course_completion_notify ON public.enrollments;
CREATE TRIGGER trg_org_course_completion_notify
AFTER INSERT OR UPDATE OF status ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.create_org_course_completion_notification();

-- 4. Additive RLS for org_staff with students.read permission (course_completed only)
CREATE POLICY "Org staff can view course_completed notifications"
ON public.org_notifications
FOR SELECT
TO authenticated
USING (
  type = 'course_completed'
  AND public.has_org_staff_permission(auth.uid(), organization_id, 'students.read')
);

CREATE POLICY "Org staff can mark course_completed notifications read"
ON public.org_notifications
FOR UPDATE
TO authenticated
USING (
  type = 'course_completed'
  AND public.has_org_staff_permission(auth.uid(), organization_id, 'students.read')
)
WITH CHECK (
  type = 'course_completed'
  AND public.has_org_staff_permission(auth.uid(), organization_id, 'students.read')
);
