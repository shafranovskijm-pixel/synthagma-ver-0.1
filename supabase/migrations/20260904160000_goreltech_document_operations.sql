-- A durable response receipt for one caller intent. No expiry, inferred success,
-- or retry of the underlying batch once the receipt has committed.
CREATE TABLE public.goreltech_document_operations (
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, group_id, operation_id),
  CHECK ((receipt->>'operationId') IS NOT DISTINCT FROM operation_id::text)
);
COMMENT ON TABLE public.goreltech_document_operations IS
  'Immutable receipt of a committed GORELTECH document batch. Scope UUIDs intentionally have no cascading foreign keys: deleting a group/user must not erase operation evidence. Same operation ID means the original intent, even if a later request body differs.';

ALTER TABLE public.goreltech_document_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.goreltech_document_operations FROM PUBLIC, anon, authenticated, service_role;
-- There are deliberately no direct-access policies or grants. Only the narrowly
-- scoped SECURITY DEFINER RPCs below can read/write the receipts.

CREATE FUNCTION public.get_goreltech_document_operation(
  p_actor_id uuid,
  p_organization_id uuid,
  p_group_id uuid,
  p_operation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_saved public.goreltech_document_operations%ROWTYPE;
  v_jwt_role text := COALESCE(
    NULLIF(auth.jwt()->>'role', ''),
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
BEGIN
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR NOT COALESCE((
    public.has_role(p_actor_id, 'admin'::public.app_role)
    OR public.is_org_owner(p_actor_id, p_organization_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.org_staff s
        WHERE s.user_id = p_actor_id AND s.organization_id = p_organization_id
          AND (s.expires_at IS NULL OR s.expires_at > now())
      )
      AND public.has_org_staff_permission(p_actor_id, p_organization_id, 'documents.manage')
    )
  ), false) THEN
    RAISE EXCEPTION 'actor is not allowed to manage organization documents' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS DISTINCT FROM '7237f9d4-3670-4a19-8946-a43c68fd3473'::uuid
    OR NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_organization_id
        AND regexp_replace(COALESCE(o.inn, ''), '\D', '', 'g') = '7806541216'
        AND COALESCE(o.name, '') ~* 'ГОРЭЛТЕХ'
    ) THEN
    RAISE EXCEPTION 'exact GORELTECH organization is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'group does not belong to GORELTECH organization' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'operation ID is required' USING ERRCODE = '22023';
  END IF;
  -- This read is intentionally non-blocking. NULL only means there is no
  -- committed receipt visible now; it never proves that a prior save stopped.
  SELECT * INTO v_saved FROM public.goreltech_document_operations o
  WHERE o.organization_id = p_organization_id AND o.group_id = p_group_id
    AND o.operation_id = p_operation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_saved.actor_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'operation belongs to another actor' USING ERRCODE = '42501';
  END IF;
  RETURN v_saved.receipt;
END;
$function$;

CREATE FUNCTION public.create_goreltech_group_document_batch_once(
  p_actor_id uuid,
  p_organization_id uuid,
  p_group_id uuid,
  p_operation_id uuid,
  p_docs jsonb,
  p_warnings text[] DEFAULT '{}'::text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_saved public.goreltech_document_operations%ROWTYPE;
  v_batch record;
  v_document jsonb;
  v_receipt jsonb;
  v_jwt_role text := COALESCE(
    NULLIF(auth.jwt()->>'role', ''),
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
BEGIN
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR NOT COALESCE((
    public.has_role(p_actor_id, 'admin'::public.app_role)
    OR public.is_org_owner(p_actor_id, p_organization_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.org_staff s
        WHERE s.user_id = p_actor_id AND s.organization_id = p_organization_id
          AND (s.expires_at IS NULL OR s.expires_at > now())
      )
      AND public.has_org_staff_permission(p_actor_id, p_organization_id, 'documents.manage')
    )
  ), false) THEN
    RAISE EXCEPTION 'actor is not allowed to manage organization documents' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS DISTINCT FROM '7237f9d4-3670-4a19-8946-a43c68fd3473'::uuid
    OR NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_organization_id
        AND regexp_replace(COALESCE(o.inn, ''), '\D', '', 'g') = '7806541216'
        AND COALESCE(o.name, '') ~* 'ГОРЭЛТЕХ'
    ) THEN
    RAISE EXCEPTION 'exact GORELTECH organization is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'group does not belong to GORELTECH organization' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'operation ID is required' USING ERRCODE = '22023';
  END IF;

  -- Same intent serializes before receipt lookup. The existing batch RPC also
  -- locks the group to serialize distinct package versions. Both locks live for
  -- the entire transaction, including receipt insertion/commit or rollback.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'goreltech-document-operation:' || p_organization_id::text || ':'
      || p_group_id::text || ':' || p_operation_id::text, 0
  ));
  SELECT * INTO v_saved FROM public.goreltech_document_operations o
  WHERE o.organization_id = p_organization_id AND o.group_id = p_group_id
    AND o.operation_id = p_operation_id;
  IF FOUND THEN
    IF v_saved.actor_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'operation belongs to another actor' USING ERRCODE = '42501';
    END IF;
    -- Do not validate/use the later body or warnings and never call batch twice.
    RETURN v_saved.receipt;
  END IF;
  IF COALESCE(array_ndims(p_warnings), 1) > 1 THEN
    RAISE EXCEPTION 'warnings must be a one-dimensional text array without nulls' USING ERRCODE = '22023';
  END IF;
  IF array_position(p_warnings, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'warnings must be a one-dimensional text array without nulls' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT v_batch
  FROM public.create_goreltech_group_document_batch(p_actor_id, p_organization_id, p_group_id, p_docs);
  IF v_batch.batch_id IS NULL OR v_batch.batch_version IS NULL OR v_batch.batch_version < 1
    OR v_batch.inserted_count IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION 'batch result could not be confirmed' USING ERRCODE = 'P0001';
  END IF;
  -- Build the document response from persisted facts, not the retry body.
  v_document := (
    SELECT jsonb_build_object(
      'doc_type', gd.doc_type, 'name', gd.name, 'file_path', gd.file_path,
      'docx_sha256', gd.docx_sha256, 'pdf_status', gd.pdf_status,
      'template_version_label', gd.template_version_label
    )
    FROM public.group_documents gd
    WHERE gd.organization_id = p_organization_id AND gd.group_id = p_group_id
      AND gd.package_batch_id = v_batch.batch_id AND gd.doc_type = 'class_journal'
  );
  v_receipt := jsonb_build_object(
    'operationId', p_operation_id,
    'batch', jsonb_build_object(
      'batch_id', v_batch.batch_id, 'batch_version', v_batch.batch_version,
      'inserted_count', v_batch.inserted_count
    ),
    'document', v_document,
    'warnings', to_jsonb(COALESCE(p_warnings, '{}'::text[]))
  );
  INSERT INTO public.goreltech_document_operations
    (organization_id, group_id, operation_id, actor_id, receipt)
  VALUES (p_organization_id, p_group_id, p_operation_id, p_actor_id, v_receipt);
  -- Any error after batch creation rolls back the batch, previous-current flags
  -- and this receipt together. No exception handler may turn it into a success.
  RETURN v_receipt;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_goreltech_document_operation(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_goreltech_group_document_batch_once(uuid, uuid, uuid, uuid, jsonb, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_goreltech_document_operation(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_goreltech_group_document_batch_once(uuid, uuid, uuid, uuid, jsonb, text[]) TO service_role;
