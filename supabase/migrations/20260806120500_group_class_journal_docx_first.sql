-- Явные реквизиты журнала: ни преподаватель, ни даты не угадываются.
ALTER TABLE public.student_groups
  ADD COLUMN IF NOT EXISTS instructor_name text,
  ADD COLUMN IF NOT EXISTS training_dates date[] NOT NULL DEFAULT '{}'::date[];

COMMENT ON COLUMN public.student_groups.instructor_name IS
  'ФИО преподавателя для журнала и расписания; не подменяется руководителем';
COMMENT ON COLUMN public.student_groups.training_dates IS
  'Явные даты занятий; в шаблоне журнала ГОРЭЛТЕХ v1 ровно 4 колонки';

-- Метаданные DOCX-first на том же уровне, что и у договоров.
ALTER TABLE public.group_documents
  ADD COLUMN IF NOT EXISTS template_registry_key text,
  ADD COLUMN IF NOT EXISTS template_version_label text,
  ADD COLUMN IF NOT EXISTS template_sha256 text,
  ADD COLUMN IF NOT EXISTS variables_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS docx_sha256 text,
  ADD COLUMN IF NOT EXISTS pdf_status text NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'draft';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_documents_pdf_status_check'
  ) THEN
    ALTER TABLE public.group_documents
      ADD CONSTRAINT group_documents_pdf_status_check
      CHECK (pdf_status IN ('unavailable', 'pending', 'ready'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_documents_generation_status_check'
  ) THEN
    ALTER TABLE public.group_documents
      ADD CONSTRAINT group_documents_generation_status_check
      CHECK (generation_status IN ('draft', 'generated', 'failed'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_student_group_settings(p_group_id uuid, p_patch jsonb)
RETURNS student_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_row public.student_groups;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'invalid_patch' USING ERRCODE = '22023';
  END IF;

  SELECT g.organization_id INTO v_org
  FROM public.student_groups g
  WHERE g.id = p_group_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'group_not_found' USING ERRCODE = 'P0002'; END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id = v_org
    )
    OR EXISTS (
      SELECT 1 FROM public.org_staff s
      WHERE s.user_id = auth.uid() AND s.organization_id = v_org
        AND (s.expires_at IS NULL OR s.expires_at > now())
    )
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  IF p_patch ? 'training_dates'
     AND jsonb_typeof(p_patch->'training_dates') <> 'array' THEN
    RAISE EXCEPTION 'training_dates_must_be_array' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'training_dates'
     AND jsonb_array_length(p_patch->'training_dates') > 4 THEN
    RAISE EXCEPTION 'training_dates_max_4' USING ERRCODE = '22023';
  END IF;

  UPDATE public.student_groups AS g
  SET
    name = CASE WHEN p_patch ? 'name' THEN COALESCE(NULLIF(btrim(p_patch->>'name'), ''), g.name) ELSE g.name END,
    color = CASE WHEN p_patch ? 'color' THEN NULLIF(btrim(p_patch->>'color'), '') ELSE g.color END,
    start_date = CASE WHEN p_patch ? 'start_date' THEN NULLIF(p_patch->>'start_date', '')::date ELSE g.start_date END,
    end_date = CASE WHEN p_patch ? 'end_date' THEN NULLIF(p_patch->>'end_date', '')::date ELSE g.end_date END,
    group_number = CASE WHEN p_patch ? 'group_number' THEN NULLIF(btrim(p_patch->>'group_number'), '') ELSE g.group_number END,
    program_title = CASE WHEN p_patch ? 'program_title' THEN NULLIF(btrim(p_patch->>'program_title'), '') ELSE g.program_title END,
    program_hours = CASE WHEN p_patch ? 'program_hours' THEN NULLIF(p_patch->>'program_hours', '')::integer ELSE g.program_hours END,
    program_form = CASE WHEN p_patch ? 'program_form' THEN NULLIF(btrim(p_patch->>'program_form'), '') ELSE g.program_form END,
    default_price = CASE WHEN p_patch ? 'default_price' THEN NULLIF(p_patch->>'default_price', '')::numeric ELSE g.default_price END,
    training_address = CASE WHEN p_patch ? 'training_address' THEN NULLIF(btrim(p_patch->>'training_address'), '') ELSE g.training_address END,
    schedule_text = CASE WHEN p_patch ? 'schedule_text' THEN NULLIF(btrim(p_patch->>'schedule_text'), '') ELSE g.schedule_text END,
    instructor_name = CASE WHEN p_patch ? 'instructor_name' THEN NULLIF(btrim(p_patch->>'instructor_name'), '') ELSE g.instructor_name END,
    training_dates = CASE WHEN p_patch ? 'training_dates' THEN
      ARRAY(
        SELECT d.value::date
        FROM jsonb_array_elements_text(p_patch->'training_dates') AS d(value)
        WHERE btrim(d.value) <> ''
        ORDER BY d.value::date
      )
      ELSE g.training_dates END,
    course_id = CASE WHEN p_patch ? 'course_id' THEN NULLIF(p_patch->>'course_id', '')::uuid ELSE g.course_id END,
    max_seats = CASE WHEN p_patch ? 'max_seats' THEN NULLIF(p_patch->>'max_seats', '')::integer ELSE g.max_seats END,
    strict_order = CASE WHEN p_patch ? 'strict_order' THEN (p_patch->>'strict_order')::boolean ELSE g.strict_order END,
    limit_access_time = CASE WHEN p_patch ? 'limit_access_time' THEN (p_patch->>'limit_access_time')::boolean ELSE g.limit_access_time END,
    schedule_access = CASE WHEN p_patch ? 'schedule_access' THEN (p_patch->>'schedule_access')::boolean ELSE g.schedule_access END,
    block_resubmit = CASE WHEN p_patch ? 'block_resubmit' THEN (p_patch->>'block_resubmit')::boolean ELSE g.block_resubmit END,
    show_locked_lessons = CASE WHEN p_patch ? 'show_locked_lessons' THEN (p_patch->>'show_locked_lessons')::boolean ELSE g.show_locked_lessons END,
    enable_channel = CASE WHEN p_patch ? 'enable_channel' THEN (p_patch->>'enable_channel')::boolean ELSE g.enable_channel END,
    enable_group_chat = CASE WHEN p_patch ? 'enable_group_chat' THEN (p_patch->>'enable_group_chat')::boolean ELSE g.enable_group_chat END,
    block_student_dialogs = CASE WHEN p_patch ? 'block_student_dialogs' THEN (p_patch->>'block_student_dialogs')::boolean ELSE g.block_student_dialogs END,
    updated_at = now()
  WHERE g.id = p_group_id
  RETURNING g.* INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'group_update_failed' USING ERRCODE = 'P0002'; END IF;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_student_group_settings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_student_group_settings(uuid, jsonb) TO authenticated, service_role;

-- Пакетная RPC принимает как legacy HTML, так и метаданные DOCX.
CREATE OR REPLACE FUNCTION public.create_group_document_batch(
  p_organization_id uuid,
  p_group_id uuid,
  p_docs jsonb
)
RETURNS TABLE (batch_id uuid, batch_version integer, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_version integer;
  v_count integer := 0;
  v_docs_count integer;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_docs IS NULL OR jsonb_typeof(p_docs) <> 'array' THEN
    RAISE EXCEPTION 'p_docs must be a non-empty jsonb array';
  END IF;
  v_docs_count := jsonb_array_length(p_docs);
  IF v_docs_count = 0 OR v_docs_count > 500 THEN
    RAISE EXCEPTION 'p_docs count must be between 1 and 500, got %', v_docs_count;
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_org_staff_permission(p_organization_id, 'documents.manage')
    OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id AND o.user_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'insufficient privileges for organization %', p_organization_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'group % does not belong to organization %', p_group_id, p_organization_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_group_id::text, 0));
  SELECT COALESCE(MAX(gd.package_version), 0) + 1 INTO v_version
  FROM public.group_documents gd
  WHERE gd.organization_id = p_organization_id AND gd.group_id = p_group_id
    AND gd.package_batch_id IS NOT NULL;

  UPDATE public.group_documents gd
  SET is_current = false, updated_at = now()
  WHERE gd.organization_id = p_organization_id AND gd.group_id = p_group_id
    AND gd.package_batch_id IS NOT NULL AND gd.package_batch_id <> v_batch
    AND gd.is_current IS DISTINCT FROM false;

  INSERT INTO public.group_documents (
    organization_id, group_id, doc_type, name, document_number, document_date,
    variables, html, file_path, status, doc_status, fill_mode, layout_format, source_note,
    student_user_id, company_id, package_batch_id, package_version, is_current, created_by,
    template_registry_key, template_version_label, template_sha256, variables_snapshot,
    docx_sha256, pdf_status, generation_status
  )
  SELECT
    p_organization_id, p_group_id, d->>'doc_type', d->>'name',
    NULLIF(d->>'document_number', ''), NULLIF(d->>'document_date', '')::date,
    COALESCE(d->'variables', '{}'::jsonb), d->>'html', NULLIF(d->>'file_path', ''),
    'active', COALESCE(NULLIF(d->>'doc_status', ''), 'draft'),
    COALESCE(NULLIF(d->>'fill_mode', ''), 'blank'),
    COALESCE(NULLIF(d->>'layout_format', ''), 'legacy_html'), NULLIF(d->>'source_note', ''),
    NULLIF(d->>'student_user_id', '')::uuid, NULLIF(d->>'company_id', '')::uuid,
    v_batch, v_version, true, v_uid,
    NULLIF(d->>'template_registry_key', ''), NULLIF(d->>'template_version_label', ''),
    NULLIF(d->>'template_sha256', ''), d->'variables_snapshot',
    NULLIF(d->>'docx_sha256', ''), COALESCE(NULLIF(d->>'pdf_status', ''), 'unavailable'),
    COALESCE(NULLIF(d->>'generation_status', ''), 'draft')
  FROM jsonb_array_elements(p_docs) AS d;

  SELECT count(*)::int INTO v_count FROM public.group_documents gd WHERE gd.package_batch_id = v_batch;
  RETURN QUERY SELECT v_batch, v_version, v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group_document_batch(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_document_batch(uuid, uuid, jsonb) TO authenticated, service_role;
