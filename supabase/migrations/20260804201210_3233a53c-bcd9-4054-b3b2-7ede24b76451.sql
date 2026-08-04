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
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_org_staff_permission(p_organization_id, 'documents.manage')
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_organization_id AND o.user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'insufficient privileges for organization %', p_organization_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'group % does not belong to organization %', p_group_id, p_organization_id;
  END IF;

  -- Следующая версия партии для этой группы
  SELECT COALESCE(MAX(gd.package_version), 0) + 1
    INTO v_version
  FROM public.group_documents gd
  WHERE gd.organization_id = p_organization_id
    AND gd.group_id = p_group_id
    AND gd.package_batch_id IS NOT NULL;

  -- Предыдущие версионированные партии больше не текущие.
  -- Записи без package_batch_id (созданные до версионирования) не трогаем.
  UPDATE public.group_documents gd
     SET is_current = false, updated_at = now()
   WHERE gd.organization_id = p_organization_id
     AND gd.group_id = p_group_id
     AND gd.package_batch_id IS NOT NULL
     AND gd.package_batch_id <> v_batch
     AND gd.is_current IS DISTINCT FROM false;

  INSERT INTO public.group_documents (
    organization_id, group_id, doc_type, name, document_number, document_date,
    variables, html, status, doc_status, fill_mode, layout_format, source_note,
    student_user_id, company_id,
    package_batch_id, package_version, is_current, created_by
  )
  SELECT
    p_organization_id,
    p_group_id,
    d->>'doc_type',
    d->>'name',
    NULLIF(d->>'document_number', ''),
    NULLIF(d->>'document_date', '')::date,
    COALESCE(d->'variables', '{}'::jsonb),
    d->>'html',
    'active',
    COALESCE(NULLIF(d->>'doc_status', ''), 'draft'),
    COALESCE(NULLIF(d->>'fill_mode', ''), 'blank'),
    COALESCE(NULLIF(d->>'layout_format', ''), 'legacy_html'),
    NULLIF(d->>'source_note', ''),
    NULLIF(d->>'student_user_id', '')::uuid,
    NULLIF(d->>'company_id', '')::uuid,
    v_batch,
    v_version,
    true,
    v_uid
  FROM jsonb_array_elements(p_docs) AS d;

  SELECT count(*)::int INTO v_count
  FROM public.group_documents gd
  WHERE gd.package_batch_id = v_batch;

  RETURN QUERY SELECT v_batch, v_version, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_group_document_batch(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_document_batch(uuid, uuid, jsonb) TO service_role;