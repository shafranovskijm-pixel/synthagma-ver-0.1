-- Protocol metadata is independent from issuance of education documents.
-- No backfill: completion of a course is not evidence of a passed knowledge check.
CREATE TABLE public.labor_safety_enrollment_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  source_enrollment_id uuid NOT NULL,
  source_user_id uuid NOT NULL,
  source_course_id uuid NOT NULL,
  learner_name_snapshot text,
  course_title_snapshot text NOT NULL,
  protocol_number text NOT NULL CHECK (length(btrim(protocol_number)) BETWEEN 1 AND 200),
  knowledge_check_date date NOT NULL,
  is_passed boolean NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labor_safety_enrollment_protocols_org_enrollment_key
    UNIQUE (organization_id, source_enrollment_id),
  CONSTRAINT labor_safety_enrollment_protocols_source_check
    CHECK (enrollment_id IS NULL OR enrollment_id = source_enrollment_id)
);

COMMENT ON TABLE public.labor_safety_enrollment_protocols IS
  'Operator-entered knowledge-check protocol for one enrollment. Not a certificate and not confirmation of Mintrud acceptance.';

ALTER TABLE public.labor_safety_enrollment_protocols ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.labor_safety_enrollment_protocols FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.labor_safety_enrollment_protocols TO authenticated;
GRANT ALL ON TABLE public.labor_safety_enrollment_protocols TO service_role;

CREATE POLICY labor_safety_enrollment_protocols_read
ON public.labor_safety_enrollment_protocols FOR SELECT TO authenticated
USING (public.can_access_organization(organization_id, 'labor_safety.read'));

-- Keep audit identity and initial server snapshots when an enrollment or author
-- is removed. A nullable live FK must never allow reattaching an old protocol.
CREATE OR REPLACE FUNCTION public.protect_labor_safety_protocol_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $trigger$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.source_enrollment_id IS DISTINCT FROM OLD.source_enrollment_id
     OR NEW.source_user_id IS DISTINCT FROM OLD.source_user_id
     OR NEW.source_course_id IS DISTINCT FROM OLD.source_course_id
     OR NEW.learner_name_snapshot IS DISTINCT FROM OLD.learner_name_snapshot
     OR NEW.course_title_snapshot IS DISTINCT FROM OLD.course_title_snapshot
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (NEW.enrollment_id IS NOT NULL AND NEW.enrollment_id IS DISTINCT FROM OLD.enrollment_id)
  THEN
    RAISE EXCEPTION 'Источник сохранённого протокола нельзя изменить' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$trigger$;
REVOKE ALL ON FUNCTION public.protect_labor_safety_protocol_source() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_labor_safety_protocol_source
BEFORE UPDATE ON public.labor_safety_enrollment_protocols
FOR EACH ROW EXECUTE FUNCTION public.protect_labor_safety_protocol_source();

CREATE OR REPLACE FUNCTION public.save_labor_safety_enrollment_protocol(
  p_organization_id uuid,
  p_enrollment_id uuid,
  p_protocol_number text,
  p_knowledge_check_date date,
  p_is_passed boolean,
  p_expected_version integer DEFAULT NULL
)
RETURNS SETOF public.labor_safety_enrollment_protocols
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_protocol_number text := btrim(p_protocol_number);
  v_record public.labor_safety_enrollment_protocols%ROWTYPE;
  v_source record;
BEGIN
  IF v_user_id IS NULL
     OR NOT public.can_access_organization(p_organization_id, 'labor_safety.read')
     OR NOT public.can_access_organization(p_organization_id, 'labor_safety.write')
  THEN
    RAISE EXCEPTION 'Недостаточно прав для сохранения протокола охраны труда'
      USING ERRCODE = '42501';
  END IF;

  IF v_protocol_number IS NULL OR length(v_protocol_number) NOT BETWEEN 1 AND 200
     OR p_knowledge_check_date IS NULL OR NOT isfinite(p_knowledge_check_date)
     OR p_knowledge_check_date::text !~ '^\d{4}-\d{2}-\d{2}$' OR p_is_passed IS NULL
  THEN
    RAISE EXCEPTION 'Укажите номер протокола, дату проверки знаний и результат'
      USING ERRCODE = '22023';
  END IF;

  -- Never trust organization/user/course identifiers supplied by the browser.
  -- Only the exact enrollment of a student and course in this tenant is eligible.
  SELECT e.user_id, e.course_id, p.full_name, c.title
  INTO v_source
  FROM public.enrollments e
  JOIN public.courses c ON c.id = e.course_id
  JOIN public.profiles p ON p.user_id = e.user_id
  JOIN public.course_categories cat ON cat.id = c.category_id
  WHERE e.id = p_enrollment_id
    AND c.organization_id = p_organization_id
    AND p.organization_id = p_organization_id
    AND cat.organization_id = p_organization_id
    -- Explicit Cyrillic fold also works on databases initialized with C locale.
    AND translate(cat.name, 'ОХРАНТУД', 'охрантуд') LIKE '%охрана труда%'
    AND e.status = 'completed'
  FOR SHARE OF e, c, p, cat;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Завершённое зачисление не найдено в этой организации'
      USING ERRCODE = '42501';
  END IF;

  IF p_expected_version IS NULL THEN
    INSERT INTO public.labor_safety_enrollment_protocols (
      organization_id, enrollment_id, source_enrollment_id, source_user_id,
      source_course_id, learner_name_snapshot, course_title_snapshot,
      protocol_number, knowledge_check_date,
      is_passed, created_by, updated_by
    ) VALUES (
      p_organization_id, p_enrollment_id, p_enrollment_id, v_source.user_id,
      v_source.course_id, v_source.full_name, v_source.title,
      v_protocol_number, p_knowledge_check_date,
      p_is_passed, v_user_id, v_user_id
    )
    ON CONFLICT (organization_id, source_enrollment_id) DO NOTHING
    RETURNING * INTO v_record;
  ELSE
    UPDATE public.labor_safety_enrollment_protocols
    SET protocol_number = v_protocol_number,
        knowledge_check_date = p_knowledge_check_date,
        is_passed = p_is_passed,
        version = version + 1,
        updated_by = v_user_id,
        updated_at = clock_timestamp()
    WHERE organization_id = p_organization_id
      AND enrollment_id = p_enrollment_id
      AND source_enrollment_id = p_enrollment_id
      AND source_user_id = v_source.user_id
      AND source_course_id = v_source.course_id
      AND version = p_expected_version
    RETURNING * INTO v_record;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Протокол изменён в другом окне. Обновите данные перед сохранением'
      USING ERRCODE = '40001';
  END IF;

  RETURN NEXT v_record;
END
$function$;

REVOKE ALL ON FUNCTION public.save_labor_safety_enrollment_protocol(uuid, uuid, text, date, boolean, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_labor_safety_enrollment_protocol(uuid, uuid, text, date, boolean, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
