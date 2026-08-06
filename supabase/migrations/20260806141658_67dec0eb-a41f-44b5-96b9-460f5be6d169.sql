-- Надёжное сохранение ФРДО и автоматическая синхронизация «группа → курс».

CREATE OR REPLACE FUNCTION public.save_student_frdo_data(
  p_organization_id uuid,
  p_user_id uuid,
  p_data jsonb
)
RETURNS public.student_frdo_data
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.student_frdo_data;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(p_data, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'frdo_data_must_be_object' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.org_staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = p_organization_id
        AND (s.expires_at IS NULL OR s.expires_at > now())
    )
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles student
    WHERE student.user_id = p_user_id
      AND student.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'student_not_in_organization' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.student_frdo_data AS target (
    user_id,
    organization_id,
    last_name,
    first_name,
    middle_name,
    birth_date,
    gender,
    snils,
    citizenship_code,
    education_level,
    education_doc_last_name,
    education_doc_series,
    education_doc_number,
    training_form,
    financing_source,
    education_form,
    professional_area,
    specialty_group,
    qualification_name,
    profession_name,
    qualification_rank
  )
  VALUES (
    p_user_id,
    p_organization_id,
    NULLIF(btrim(p_data->>'last_name'), ''),
    NULLIF(btrim(p_data->>'first_name'), ''),
    NULLIF(btrim(p_data->>'middle_name'), ''),
    NULLIF(btrim(p_data->>'birth_date'), '')::date,
    NULLIF(btrim(p_data->>'gender'), ''),
    NULLIF(btrim(p_data->>'snils'), ''),
    COALESCE(NULLIF(btrim(p_data->>'citizenship_code'), ''), '643'),
    NULLIF(btrim(p_data->>'education_level'), ''),
    NULLIF(btrim(p_data->>'education_doc_last_name'), ''),
    NULLIF(btrim(p_data->>'education_doc_series'), ''),
    NULLIF(btrim(p_data->>'education_doc_number'), ''),
    COALESCE(NULLIF(btrim(p_data->>'training_form'), ''), 'Очная'),
    COALESCE(NULLIF(btrim(p_data->>'financing_source'), ''), 'Платное обучение'),
    COALESCE(NULLIF(btrim(p_data->>'education_form'), ''), 'в образовательной организации'),
    NULLIF(btrim(p_data->>'professional_area'), ''),
    NULLIF(btrim(p_data->>'specialty_group'), ''),
    NULLIF(btrim(p_data->>'qualification_name'), ''),
    NULLIF(btrim(p_data->>'profession_name'), ''),
    NULLIF(btrim(p_data->>'qualification_rank'), '')
  )
  ON CONFLICT (user_id, organization_id) DO UPDATE
  SET
    last_name = EXCLUDED.last_name,
    first_name = EXCLUDED.first_name,
    middle_name = EXCLUDED.middle_name,
    birth_date = EXCLUDED.birth_date,
    gender = EXCLUDED.gender,
    snils = EXCLUDED.snils,
    citizenship_code = EXCLUDED.citizenship_code,
    education_level = EXCLUDED.education_level,
    education_doc_last_name = EXCLUDED.education_doc_last_name,
    education_doc_series = EXCLUDED.education_doc_series,
    education_doc_number = EXCLUDED.education_doc_number,
    training_form = EXCLUDED.training_form,
    financing_source = EXCLUDED.financing_source,
    education_form = EXCLUDED.education_form,
    professional_area = EXCLUDED.professional_area,
    specialty_group = EXCLUDED.specialty_group,
    qualification_name = EXCLUDED.qualification_name,
    profession_name = EXCLUDED.profession_name,
    qualification_rank = EXCLUDED.qualification_rank,
    updated_at = now()
  RETURNING target.* INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'frdo_save_failed' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_student_frdo_data(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_student_frdo_data(uuid, uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_profile_group_course_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_course_id uuid;
  v_group_org_id uuid;
BEGIN
  IF NEW.student_group_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.student_group_id IS NOT DISTINCT FROM OLD.student_group_id THEN
    RETURN NEW;
  END IF;

  SELECT g.course_id, g.organization_id
  INTO v_course_id, v_group_org_id
  FROM public.student_groups g
  WHERE g.id = NEW.student_group_id;

  IF v_course_id IS NOT NULL AND v_group_org_id IS NOT DISTINCT FROM NEW.organization_id THEN
    INSERT INTO public.enrollments (user_id, course_id, status, progress, time_spent)
    VALUES (NEW.user_id, v_course_id, 'active', 0, 0)
    ON CONFLICT (user_id, course_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_profile_group_course_enrollment_trigger ON public.profiles;
CREATE TRIGGER sync_profile_group_course_enrollment_trigger
AFTER INSERT OR UPDATE OF student_group_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_group_course_enrollment();

CREATE OR REPLACE FUNCTION public.sync_group_course_enrollments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.course_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.course_id IS NOT DISTINCT FROM OLD.course_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.enrollments (user_id, course_id, status, progress, time_spent)
  SELECT p.user_id, NEW.course_id, 'active', 0, 0
  FROM public.profiles p
  WHERE p.student_group_id = NEW.id
    AND p.organization_id = NEW.organization_id
  ON CONFLICT (user_id, course_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_group_course_enrollments_trigger ON public.student_groups;
CREATE TRIGGER sync_group_course_enrollments_trigger
AFTER INSERT OR UPDATE OF course_id ON public.student_groups
FOR EACH ROW
EXECUTE FUNCTION public.sync_group_course_enrollments();

-- Backfill existing group-course relations without touching progress.
INSERT INTO public.enrollments (user_id, course_id, status, progress, time_spent)
SELECT p.user_id, g.course_id, 'active', 0, 0
FROM public.profiles p
JOIN public.student_groups g
  ON g.id = p.student_group_id
 AND g.organization_id = p.organization_id
WHERE g.course_id IS NOT NULL
ON CONFLICT (user_id, course_id) DO NOTHING;