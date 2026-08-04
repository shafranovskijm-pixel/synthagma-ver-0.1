-- 1) Additive columns: exact provenance of an issued education document.
ALTER TABLE public.education_document_records
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS course_id uuid,
  ADD COLUMN IF NOT EXISTS group_id uuid,
  ADD COLUMN IF NOT EXISTS education_result text;

CREATE INDEX IF NOT EXISTS idx_edu_doc_records_group ON public.education_document_records(organization_id, group_id, course_id);
CREATE INDEX IF NOT EXISTS idx_edu_doc_records_user ON public.education_document_records(organization_id, user_id);

-- 2) Uniqueness protection scoped to organization.
-- NOTE on legacy data: verified 0 duplicate (organization_id, document_number)
-- and (organization_id, reg_number) pairs among non-deleted rows before creating
-- these indexes. Blank/NULL numbers are excluded from the constraint instead of
-- being rewritten or deleted, so no historical record is modified. If a future
-- restore introduces duplicates, index creation fails loudly (safe) and the
-- duplicates must be renumbered manually.
CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_doc_records_document_number
  ON public.education_document_records(organization_id, document_number)
  WHERE deleted_at IS NULL AND document_number IS NOT NULL AND btrim(document_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_doc_records_reg_number
  ON public.education_document_records(organization_id, reg_number)
  WHERE deleted_at IS NULL AND reg_number IS NOT NULL AND btrim(reg_number) <> '';

-- 3) Transactional batch issuance.
CREATE OR REPLACE FUNCTION public.issue_education_document_batch(
  p_organization_id uuid,
  p_group_id uuid,
  p_course_id uuid,
  p_items jsonb
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
  v_doc_number text;
  v_reg_number text;
  v_new_id uuid;
  v_ids uuid[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;
  IF NOT (has_role('admin'::app_role, auth.uid()) OR p_organization_id = current_organization_id()) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items must be a non-empty array';
  END IF;

  -- Serialize numbering per organization: parallel batches cannot share numbers.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  IF p_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.student_groups g
      WHERE g.id = p_group_id
        AND g.organization_id = p_organization_id
        AND (p_course_id IS NULL OR g.course_id IS NULL OR g.course_id = p_course_id)
    ) THEN
      RAISE EXCEPTION 'group % does not belong to organization/course', p_group_id;
    END IF;
  END IF;

  IF p_course_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = p_course_id AND c.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'course % does not belong to organization', p_course_id;
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_user_id := NULLIF(v_item->>'user_id', '')::uuid;
    v_enrollment_id := NULLIF(v_item->>'enrollment_id', '')::uuid;
    v_doc_type := COALESCE(NULLIF(v_item->>'document_type', ''), 'certificate');
    v_issue_date := COALESCE(NULLIF(v_item->>'issue_date', '')::date, CURRENT_DATE);
    v_year := EXTRACT(YEAR FROM v_issue_date)::int;

    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'user_id is required for every item';
    END IF;

    -- Student must belong to this organization (and to the exact group when given).
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.user_id = v_user_id
        AND pr.organization_id = p_organization_id
        AND (p_group_id IS NULL OR pr.student_group_id = p_group_id)
    ) THEN
      RAISE EXCEPTION 'student % is not a member of the specified organization/group', v_user_id;
    END IF;

    -- Enrollment must belong to the same student and the exact course.
    IF v_enrollment_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.id = v_enrollment_id
          AND e.user_id = v_user_id
          AND (p_course_id IS NULL OR e.course_id = p_course_id)
      ) THEN
        RAISE EXCEPTION 'enrollment % does not belong to student %/course %', v_enrollment_id, v_user_id, p_course_id;
      END IF;
    ELSIF p_course_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.user_id = v_user_id AND e.course_id = p_course_id
      ) THEN
        RAISE EXCEPTION 'student % is not enrolled in course %', v_user_id, p_course_id;
      END IF;
    END IF;

    -- Atomic allocation of both numbers (no counts, no fallbacks).
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, 'edu_doc:' || v_doc_type, v_year, 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = document_number_sequences.last_number + 1, updated_at = now()
    RETURNING last_number INTO v_doc_n;

    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, 'edu_reg:' || v_doc_type, v_year, 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = document_number_sequences.last_number + 1, updated_at = now()
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
      COALESCE(NULLIF(v_item->>'full_name', ''), ''),
      NULLIF(v_item->>'birth_date', '')::date,
      v_issue_date,
      COALESCE(NULLIF(v_item->>'specialty_name', ''), ''),
      NULLIF(v_item->>'qualification_name', ''),
      COALESCE(NULLIF(v_item->>'document_status', ''), 'original'),
      COALESCE(NULLIF(v_item->>'delivery_method', ''), 'personal'),
      NULLIF(v_item->>'education_result', ''),
      NULLIF(v_item->>'notes', '')
    )
    RETURNING id INTO v_new_id;

    v_ids := array_append(v_ids, v_new_id);
  END LOOP;

  RETURN QUERY
    SELECT * FROM public.education_document_records r
    WHERE r.id = ANY(v_ids)
    ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) TO service_role;