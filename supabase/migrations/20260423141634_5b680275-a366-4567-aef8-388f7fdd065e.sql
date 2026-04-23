DROP FUNCTION IF EXISTS public.get_frdo_export_readiness(uuid);

CREATE OR REPLACE FUNCTION public.get_frdo_export_readiness(p_organization_id uuid)
RETURNS TABLE(
  total_documents integer,
  ready_for_export integer,
  missing_frdo_data integer,
  missing_birth_date integer,
  missing_snils integer,
  missing_passport integer,
  missing_gender_resolvable integer,
  missing_gender_unresolvable integer,
  missing_profession_name integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    has_role('admin'::app_role, auth.uid())
    OR (has_role('organization'::app_role, auth.uid()) AND current_organization_id() = p_organization_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH docs AS (
    SELECT edr.id, edr.enrollment_id, e.user_id, e.course_id
    FROM education_document_records edr
    LEFT JOIN enrollments e ON e.id = edr.enrollment_id
    WHERE edr.organization_id = p_organization_id
      AND edr.deleted_at IS NULL
  ),
  enriched AS (
    SELECT
      d.id,
      d.user_id,
      sfd.birth_date,
      sfd.snils,
      sfd.last_name,
      sfd.first_name,
      sfd.middle_name,
      sfd.gender,
      sfd.profession_name,
      sfd.passport_series,
      sfd.passport_number,
      c.frdo_profession_name AS course_profession_name,
      lower(coalesce(sfd.middle_name, '')) AS mname_lower
    FROM docs d
    LEFT JOIN student_frdo_data sfd
      ON sfd.user_id = d.user_id
     AND sfd.organization_id = p_organization_id
    LEFT JOIN courses c ON c.id = d.course_id
  )
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (
      WHERE birth_date IS NOT NULL
        AND snils IS NOT NULL AND snils <> ''
        AND last_name IS NOT NULL AND last_name <> ''
        AND first_name IS NOT NULL AND first_name <> ''
    )::integer,
    COUNT(*) FILTER (
      WHERE birth_date IS NULL
         OR snils IS NULL OR snils = ''
         OR last_name IS NULL OR last_name = ''
    )::integer,
    COUNT(*) FILTER (WHERE birth_date IS NULL)::integer,
    COUNT(*) FILTER (WHERE snils IS NULL OR snils = '')::integer,
    COUNT(*) FILTER (WHERE passport_series IS NULL OR passport_series = '' OR passport_number IS NULL OR passport_number = '')::integer,
    COUNT(*) FILTER (
      WHERE (gender IS NULL OR gender = '')
        AND (mname_lower LIKE '%ич' OR mname_lower LIKE '%ыч' OR mname_lower LIKE '%на')
    )::integer,
    COUNT(*) FILTER (
      WHERE (gender IS NULL OR gender = '')
        AND NOT (mname_lower LIKE '%ич' OR mname_lower LIKE '%ыч' OR mname_lower LIKE '%на')
    )::integer,
    COUNT(*) FILTER (
      WHERE (profession_name IS NULL OR profession_name = '')
        AND (course_profession_name IS NULL OR course_profession_name = '')
    )::integer
  FROM enriched;
END;
$function$;