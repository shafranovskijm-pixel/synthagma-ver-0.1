-- P0: exact GORELTECH documents must not receive an official status/number
-- through a browser-side INSERT/UPDATE or the legacy authenticated batch RPC.
-- The current compiler still receives several table fields through legacy HTML,
-- so only a future service-role compiler with complete DB verification may
-- persist final metadata.

CREATE OR REPLACE FUNCTION public.create_group_document_batch(
  p_organization_id uuid,
  p_group_id uuid,
  p_docs jsonb
)
RETURNS TABLE (batch_id uuid, batch_version integer, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_version integer;
  v_count integer := 0;
  v_docs_count integer;
  v_uid uuid := auth.uid();
  v_force_goreltech_draft boolean :=
    p_organization_id = '7237f9d4-3670-4a19-8946-a43c68fd3473'::uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_docs IS NULL OR jsonb_typeof(p_docs) <> 'array' THEN
    RAISE EXCEPTION 'p_docs must be a non-empty jsonb array';
  END IF;
  v_docs_count := jsonb_array_length(p_docs);
  IF v_docs_count = 0 OR v_docs_count > 500 THEN
    RAISE EXCEPTION 'p_docs count must be between 1 and 500, got %', v_docs_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_docs) AS d
    WHERE NULLIF(btrim(d->>'doc_type'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'each p_docs item must have a non-empty doc_type';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_docs) AS d
    GROUP BY btrim(d->>'doc_type') HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'p_docs must contain unique doc_type values';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_org_staff_permission(v_uid, p_organization_id, 'documents.manage')
    OR public.is_org_owner(v_uid, p_organization_id)
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
    AND gd.is_current IS DISTINCT FROM false
    AND gd.doc_type IN (
      SELECT DISTINCT btrim(d->>'doc_type') FROM jsonb_array_elements(p_docs) AS d
    );

  INSERT INTO public.group_documents (
    organization_id, group_id, doc_type, name, document_number, document_date,
    variables, html, file_path, status, doc_status, fill_mode, layout_format, source_note,
    student_user_id, company_id, package_batch_id, package_version, is_current, created_by,
    template_registry_key, template_version_label, template_sha256, variables_snapshot,
    docx_sha256, pdf_status, generation_status
  )
  SELECT
    p_organization_id, p_group_id, btrim(d->>'doc_type'), d->>'name',
    CASE WHEN v_force_goreltech_draft THEN NULL ELSE NULLIF(d->>'document_number', '') END,
    NULLIF(d->>'document_date', '')::date,
    COALESCE(d->'variables', '{}'::jsonb), d->>'html', NULLIF(d->>'file_path', ''),
    'active', CASE
      WHEN v_force_goreltech_draft THEN 'draft'
      ELSE COALESCE(NULLIF(d->>'doc_status', ''), 'draft')
    END,
    COALESCE(NULLIF(d->>'fill_mode', ''), 'blank'),
    COALESCE(NULLIF(d->>'layout_format', ''), 'legacy_html'),
    CASE
      WHEN v_force_goreltech_draft THEN concat_ws(
        ' ',
        NULLIF(d->>'source_note', ''),
        'Пакет ГОРЭЛТЕХ сохранён как черновик без официального номера.'
      )
      ELSE NULLIF(d->>'source_note', '')
    END,
    NULLIF(d->>'student_user_id', '')::uuid, NULLIF(d->>'company_id', '')::uuid,
    v_batch, v_version, true, v_uid,
    NULLIF(d->>'template_registry_key', ''), NULLIF(d->>'template_version_label', ''),
    NULLIF(d->>'template_sha256', ''), d->'variables_snapshot',
    NULLIF(d->>'docx_sha256', ''), COALESCE(NULLIF(d->>'pdf_status', ''), 'unavailable'),
    CASE
      WHEN v_force_goreltech_draft THEN 'draft'
      ELSE COALESCE(NULLIF(d->>'generation_status', ''), 'draft')
    END
  FROM jsonb_array_elements(p_docs) AS d;

  SELECT count(*)::int INTO v_count
  FROM public.group_documents gd WHERE gd.package_batch_id = v_batch;
  RETURN QUERY SELECT v_batch, v_version, v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group_document_batch(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_document_batch(uuid, uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_goreltech_group_document_batch(
  p_actor_id uuid,
  p_organization_id uuid,
  p_group_id uuid,
  p_docs jsonb
)
RETURNS TABLE (batch_id uuid, batch_version integer, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_version integer;
  v_count integer := 0;
  v_docs_count integer;
  v_jwt_role text := COALESCE(
    NULLIF(auth.jwt()->>'role', ''),
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
  v_path_prefix text := 'organizations/' || p_organization_id::text
    || '/group-documents/' || p_group_id::text || '/';
BEGIN
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR NOT (
    public.has_role(p_actor_id, 'admin'::app_role)
    OR public.has_org_staff_permission(p_actor_id, p_organization_id, 'documents.manage')
    OR public.is_org_owner(p_actor_id, p_organization_id)
  ) THEN
    RAISE EXCEPTION 'actor is not allowed to manage organization documents' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id <> '7237f9d4-3670-4a19-8946-a43c68fd3473'::uuid
     OR NOT EXISTS (
       SELECT 1 FROM public.organizations o
       WHERE o.id = p_organization_id
         AND regexp_replace(COALESCE(o.inn, ''), '\D', '', 'g') = '7806541216'
         AND COALESCE(o.name, '') ~* 'ГОРЭЛТЕХ'
     )
  THEN
    RAISE EXCEPTION 'exact GORELTECH organization is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'group does not belong to GORELTECH organization';
  END IF;
  IF p_docs IS NULL OR jsonb_typeof(p_docs) <> 'array' THEN
    RAISE EXCEPTION 'p_docs must be a nine-document jsonb array';
  END IF;
  v_docs_count := jsonb_array_length(p_docs);
  IF v_docs_count <> 9 THEN
    RAISE EXCEPTION 'GORELTECH package must contain exactly 9 documents';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_docs) AS d
    GROUP BY btrim(d->>'doc_type') HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_docs) AS d
    WHERE btrim(d->>'doc_type') NOT IN (
      'enrollment_order', 'expulsion_order', 'student_list', 'class_journal',
      'schedule', 'attestation_sheet', 'registration_book', 'title_page', 'pass'
    )
  ) OR EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'enrollment_order', 'expulsion_order', 'student_list', 'class_journal',
      'schedule', 'attestation_sheet', 'registration_book', 'title_page', 'pass'
    ]) AS expected(doc_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_docs) AS d
      WHERE btrim(d->>'doc_type') = expected.doc_type
    )
  ) THEN
    RAISE EXCEPTION 'GORELTECH package document types are invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_docs) AS d
    WHERE COALESCE(NULLIF(d->>'doc_status', ''), 'draft') <> 'draft'
       OR NULLIF(btrim(d->>'document_number'), '') IS NOT NULL
       OR COALESCE(NULLIF(d->>'layout_format', ''), '') <> 'docx_ooxml'
       OR NULLIF(d->>'file_path', '') IS NULL
       OR position(v_path_prefix IN (d->>'file_path')) <> 1
  ) THEN
    RAISE EXCEPTION 'GORELTECH package accepts only tenant-scoped DOCX drafts without official numbers';
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
    AND gd.is_current IS DISTINCT FROM false
    AND gd.doc_type IN (
      SELECT DISTINCT btrim(d->>'doc_type') FROM jsonb_array_elements(p_docs) AS d
    );

  INSERT INTO public.group_documents (
    organization_id, group_id, doc_type, name, document_number, document_date,
    variables, html, file_path, status, doc_status, fill_mode, layout_format, source_note,
    student_user_id, company_id, package_batch_id, package_version, is_current, created_by,
    template_registry_key, template_version_label, template_sha256, variables_snapshot,
    docx_sha256, pdf_status, generation_status
  )
  SELECT
    p_organization_id, p_group_id, btrim(d->>'doc_type'), d->>'name',
    NULL, NULLIF(d->>'document_date', '')::date,
    COALESCE(d->'variables', '{}'::jsonb), NULL, d->>'file_path',
    'active', 'draft', COALESCE(NULLIF(d->>'fill_mode', ''), 'blank'),
    'docx_ooxml', NULLIF(d->>'source_note', ''),
    NULL, NULL, v_batch, v_version, true, p_actor_id,
    NULLIF(d->>'template_registry_key', ''), NULLIF(d->>'template_version_label', ''),
    NULLIF(d->>'template_sha256', ''), d->'variables_snapshot',
    NULLIF(d->>'docx_sha256', ''), COALESCE(NULLIF(d->>'pdf_status', ''), 'unavailable'),
    COALESCE(NULLIF(d->>'generation_status', ''), 'generated')
  FROM jsonb_array_elements(p_docs) AS d;

  SELECT count(*)::int INTO v_count
  FROM public.group_documents gd WHERE gd.package_batch_id = v_batch;
  RETURN QUERY SELECT v_batch, v_version, v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_goreltech_group_document_batch(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_goreltech_group_document_batch(uuid, uuid, uuid, jsonb)
  TO service_role;

WITH ranked AS (
  SELECT
    gd.id,
    row_number() OVER (
      PARTITION BY gd.organization_id, gd.group_id, gd.doc_type
      ORDER BY gd.package_version DESC NULLS LAST, gd.created_at DESC, gd.id DESC
    ) AS position
  FROM public.group_documents gd
  WHERE gd.package_batch_id IS NOT NULL
    AND gd.status = 'active'
    AND NULLIF(btrim(gd.doc_type), '') IS NOT NULL
)
UPDATE public.group_documents gd
SET is_current = (ranked.position = 1), updated_at = now()
FROM ranked
WHERE gd.id = ranked.id
  AND gd.is_current IS DISTINCT FROM (ranked.position = 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_documents_one_current_type
  ON public.group_documents (organization_id, group_id, doc_type)
  WHERE package_batch_id IS NOT NULL
    AND status = 'active'
    AND is_current IS TRUE;

CREATE OR REPLACE FUNCTION public.enforce_goreltech_group_document_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role text := COALESCE(
    auth.jwt()->>'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
  v_warning constant text :=
    'Итоговый статус не подтверждён сервером: документ сохранён как черновик без официального номера.';
BEGIN
  IF v_jwt_role IS DISTINCT FROM 'service_role'
     AND NEW.organization_id = '7237f9d4-3670-4a19-8946-a43c68fd3473'::uuid
     AND EXISTS (
       SELECT 1
       FROM public.organizations o
       WHERE o.id = NEW.organization_id
         AND regexp_replace(COALESCE(o.inn, ''), '\D', '', 'g') = '7806541216'
         AND COALESCE(o.name, '') ~* 'ГОРЭЛТЕХ'
     )
  THEN
    NEW.doc_status := 'draft';
    NEW.document_number := NULL;
    IF position(v_warning IN COALESCE(NEW.source_note, '')) = 0 THEN
      NEW.source_note := concat_ws(' ', NULLIF(btrim(NEW.source_note), ''), v_warning);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_goreltech_group_document_draft() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_goreltech_group_document_draft_insert
  ON public.group_documents;
CREATE TRIGGER enforce_goreltech_group_document_draft_insert
BEFORE INSERT ON public.group_documents
FOR EACH ROW
EXECUTE FUNCTION public.enforce_goreltech_group_document_draft();

DROP TRIGGER IF EXISTS enforce_goreltech_group_document_draft_update
  ON public.group_documents;
CREATE TRIGGER enforce_goreltech_group_document_draft_update
BEFORE UPDATE OF doc_status, document_number, document_date, variables, html,
  file_path, layout_format ON public.group_documents
FOR EACH ROW
EXECUTE FUNCTION public.enforce_goreltech_group_document_draft();

-- Application writes already use the SECURITY DEFINER batch RPC. Removing
-- direct DML closes the second browser bypass without changing SELECT/DELETE.
REVOKE INSERT, UPDATE ON TABLE public.group_documents FROM authenticated;
DROP POLICY IF EXISTS "Org staff can insert group documents" ON public.group_documents;
DROP POLICY IF EXISTS "Org staff can update group documents" ON public.group_documents;
