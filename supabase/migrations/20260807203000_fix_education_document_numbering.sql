-- Use one organization-wide numbering stream for education documents.
-- Historical auto-issued documents used COUNT()+1 without advancing the
-- sequence table, while batch export used a separate stream per document type.
-- Both behaviours could produce the same organization/document number.

CREATE OR REPLACE FUNCTION public.auto_create_education_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course public.courses%ROWTYPE;
  v_full_name text;
  v_birth_date date;
  v_group_id uuid;
  v_doc_type text;
  v_doc_n integer;
  v_reg_n integer;
  v_max_doc integer;
  v_max_reg integer;
  v_year integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed'
     OR (TG_OP = 'UPDATE' AND OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = NEW.course_id;
  IF NOT FOUND OR v_course.frdo_program_type IS NULL THEN RETURN NEW; END IF;

  v_doc_type := CASE v_course.frdo_program_type
    WHEN 'qualification_upgrade' THEN 'certificate'
    WHEN 'professional_retraining' THEN 'diploma'
    WHEN 'professional_training' THEN 'qualification'
    ELSE NULL
  END;
  IF v_doc_type IS NULL THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_course.organization_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.education_document_records edr
    WHERE edr.enrollment_id = NEW.id
      AND lower(btrim(edr.document_status)) IN ('original', 'оригинал')
      AND edr.deleted_at IS NULL
  ) THEN RETURN NEW; END IF;

  SELECT NULLIF(BTRIM(p.full_name), ''), p.student_group_id
  INTO v_full_name, v_group_id
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id AND p.organization_id = v_course.organization_id
  LIMIT 1;

  SELECT sfd.birth_date INTO v_birth_date
  FROM public.student_frdo_data sfd
  WHERE sfd.user_id = NEW.user_id AND sfd.organization_id = v_course.organization_id
  LIMIT 1;
  IF v_full_name IS NULL OR v_birth_date IS NULL THEN RETURN NEW; END IF;

  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  SELECT COALESCE(MAX((substring(edr.document_number FROM '([0-9]+)$'))::integer), 0)
  INTO v_max_doc
  FROM public.education_document_records edr
  WHERE edr.organization_id = v_course.organization_id
    AND EXTRACT(YEAR FROM edr.issue_date) = v_year AND edr.deleted_at IS NULL;

  INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
  VALUES (v_course.organization_id, 'edu_doc', v_year, v_max_doc + 1)
  ON CONFLICT (organization_id, doc_type, year)
  DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_doc + 1), updated_at = now()
  RETURNING last_number INTO v_doc_n;

  SELECT COALESCE(MAX((substring(edr.reg_number FROM '([0-9]+)$'))::integer), 0)
  INTO v_max_reg
  FROM public.education_document_records edr
  WHERE edr.organization_id = v_course.organization_id
    AND EXTRACT(YEAR FROM edr.issue_date) = v_year AND edr.deleted_at IS NULL;

  INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
  VALUES (v_course.organization_id, 'edu_reg', v_year, v_max_reg + 1)
  ON CONFLICT (organization_id, doc_type, year)
  DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_reg + 1), updated_at = now()
  RETURNING last_number INTO v_reg_n;

  INSERT INTO public.education_document_records (
    organization_id, user_id, course_id, group_id, enrollment_id,
    full_name, birth_date, document_type, document_number, reg_number,
    issue_date, specialty_name, qualification_name, document_status, delivery_method
  ) VALUES (
    v_course.organization_id, NEW.user_id, NEW.course_id, v_group_id, NEW.id,
    v_full_name, v_birth_date, v_doc_type,
    v_year || '/' || LPAD(v_doc_n::text, 6, '0'),
    'ДОК-' || v_year || '/' || LPAD(v_reg_n::text, 4, '0'),
    CURRENT_DATE, v_course.title, v_course.frdo_qualification_name, 'original', 'personal'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'education document was not auto-created for enrollment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_education_document_batch(
  p_organization_id uuid, p_group_id uuid, p_course_id uuid, p_items jsonb
)
RETURNS SETOF public.education_document_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_user_id uuid;
  v_enrollment_id uuid;
  v_doc_type text;
  v_issue_date date;
  v_year int;
  v_doc_n int;
  v_reg_n int;
  v_max_doc int;
  v_max_reg int;
  v_doc_number text;
  v_reg_number text;
  v_new_id uuid;
  v_existing_id uuid;
  v_group_course_id uuid;
  v_ids uuid[] := '{}';
  v_items_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id is required'; END IF;
  IF p_course_id IS NULL THEN RAISE EXCEPTION 'exact course_id is required'; END IF;
  IF NOT (has_role('admin'::app_role, auth.uid()) OR p_organization_id = current_organization_id()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a non-empty array';
  END IF;
  v_items_count := jsonb_array_length(p_items);
  IF v_items_count = 0 THEN RAISE EXCEPTION 'items must be a non-empty array'; END IF;
  IF v_items_count > 500 THEN RAISE EXCEPTION 'items exceed max batch size (500)'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id AND c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'course % does not belong to organization', p_course_id;
  END IF;
  IF p_group_id IS NOT NULL THEN
    SELECT g.course_id INTO v_group_course_id FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'group % does not belong to organization', p_group_id; END IF;
    IF v_group_course_id IS NULL OR v_group_course_id <> p_course_id THEN
      RAISE EXCEPTION 'group % is not linked to exact course %', p_group_id, p_course_id;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_user_id := NULLIF(v_item->>'user_id', '')::uuid;
    v_enrollment_id := NULLIF(v_item->>'enrollment_id', '')::uuid;
    v_doc_type := NULLIF(btrim(v_item->>'document_type'), '');
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'user_id is required for every item'; END IF;
    IF v_enrollment_id IS NULL THEN RAISE EXCEPTION 'enrollment_id is required for every item'; END IF;
    IF v_doc_type NOT IN ('certificate', 'diploma', 'qualification') THEN
      RAISE EXCEPTION 'document_type must be certificate, diploma or qualification';
    END IF;
    IF NULLIF(v_item->>'issue_date', '') IS NULL THEN RAISE EXCEPTION 'issue_date is required for every item'; END IF;
    v_issue_date := (v_item->>'issue_date')::date;
    v_year := EXTRACT(YEAR FROM v_issue_date)::int;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.user_id = v_user_id AND pr.organization_id = p_organization_id
        AND (p_group_id IS NULL OR pr.student_group_id = p_group_id)
    ) THEN RAISE EXCEPTION 'student % is not a member of the specified organization/group', v_user_id; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id = e.course_id
      WHERE e.id = v_enrollment_id AND e.user_id = v_user_id AND e.course_id = p_course_id
        AND c.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'enrollment % does not belong to student %/exact course %', v_enrollment_id, v_user_id, p_course_id;
    END IF;

    -- One enrollment has one original education document. Re-export returns it.
    SELECT r.id INTO v_existing_id
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND r.enrollment_id = v_enrollment_id
      AND lower(btrim(r.document_status)) IN ('original', 'оригинал') AND r.deleted_at IS NULL
    ORDER BY r.created_at, r.id LIMIT 1;
    IF v_existing_id IS NOT NULL THEN v_ids := array_append(v_ids, v_existing_id); CONTINUE; END IF;

    SELECT COALESCE(MAX((substring(r.document_number FROM '([0-9]+)$'))::int), 0) INTO v_max_doc
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND EXTRACT(YEAR FROM r.issue_date) = v_year AND r.deleted_at IS NULL;
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, 'edu_doc', v_year, v_max_doc + 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_doc + 1), updated_at = now()
    RETURNING last_number INTO v_doc_n;

    SELECT COALESCE(MAX((substring(r.reg_number FROM '([0-9]+)$'))::int), 0) INTO v_max_reg
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND EXTRACT(YEAR FROM r.issue_date) = v_year AND r.deleted_at IS NULL;
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, 'edu_reg', v_year, v_max_reg + 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_reg + 1), updated_at = now()
    RETURNING last_number INTO v_reg_n;

    v_doc_number := v_year::text || '/' || lpad(v_doc_n::text, 6, '0');
    v_reg_number := 'ДОК-' || v_year::text || '/' || lpad(v_reg_n::text, 4, '0');
    INSERT INTO public.education_document_records (
      organization_id, user_id, course_id, group_id, enrollment_id,
      reg_number, document_number, document_series, document_type,
      full_name, birth_date, issue_date, specialty_name, qualification_name,
      document_status, delivery_method, education_result, notes
    ) VALUES (
      p_organization_id, v_user_id, p_course_id, p_group_id, v_enrollment_id,
      v_reg_number, v_doc_number, NULLIF(v_item->>'document_series', ''), v_doc_type,
      COALESCE(NULLIF(v_item->>'full_name', ''), ''), NULLIF(v_item->>'birth_date', '')::date,
      v_issue_date, COALESCE(NULLIF(v_item->>'specialty_name', ''), ''),
      NULLIF(v_item->>'qualification_name', ''), COALESCE(NULLIF(v_item->>'document_status', ''), 'original'),
      COALESCE(NULLIF(v_item->>'delivery_method', ''), 'personal'),
      NULLIF(v_item->>'education_result', ''), NULLIF(v_item->>'notes', '')
    ) RETURNING id INTO v_new_id;
    v_ids := array_append(v_ids, v_new_id);
  END LOOP;

  RETURN QUERY SELECT * FROM public.education_document_records r
  WHERE r.id = ANY(v_ids) ORDER BY array_position(v_ids, r.id);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) TO service_role;
