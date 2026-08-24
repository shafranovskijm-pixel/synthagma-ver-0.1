-- Keep "current" at the document-type level. Regenerating one document must
-- not retire unrelated documents from the previous package.
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
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_docs) AS d
    WHERE NULLIF(btrim(d->>'doc_type'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'each p_docs item must have a non-empty doc_type';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_docs) AS d
    GROUP BY btrim(d->>'doc_type')
    HAVING count(*) > 1
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

  -- A batch may contain the whole package or only one regenerated document.
  -- Retire only earlier rows with a type present in this request.
  UPDATE public.group_documents gd
  SET is_current = false, updated_at = now()
  WHERE gd.organization_id = p_organization_id AND gd.group_id = p_group_id
    AND gd.package_batch_id IS NOT NULL AND gd.package_batch_id <> v_batch
    AND gd.is_current IS DISTINCT FROM false
    AND gd.doc_type IN (
      SELECT DISTINCT btrim(d->>'doc_type')
      FROM jsonb_array_elements(p_docs) AS d
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

  SELECT count(*)::int INTO v_count
  FROM public.group_documents gd
  WHERE gd.package_batch_id = v_batch;
  RETURN QUERY SELECT v_batch, v_version, v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group_document_batch(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_document_batch(uuid, uuid, jsonb) TO authenticated, service_role;

-- Repair flags damaged by the former whole-batch invalidation rule. Legacy
-- rows (without package_batch_id) remain untouched. Among active versioned
-- rows, exactly the latest row for each document type becomes current.
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
SET
  is_current = (ranked.position = 1),
  updated_at = now()
FROM ranked
WHERE gd.id = ranked.id
  AND gd.is_current IS DISTINCT FROM (ranked.position = 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_documents_one_current_type
  ON public.group_documents (organization_id, group_id, doc_type)
  WHERE package_batch_id IS NOT NULL
    AND status = 'active'
    AND is_current IS TRUE;
