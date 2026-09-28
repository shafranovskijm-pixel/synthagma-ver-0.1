-- Additive, admin-only act issuance for existing platform subscription invoices.
-- No invoice, payment status, historical document or existing RLS policy is changed.
CREATE TABLE public.platform_invoice_acts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.subscription_invoices(id),
  act_number text NOT NULL,
  act_date date NOT NULL,
  source_snapshot jsonb NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  html_snapshot text NOT NULL,
  html_sha256 text NOT NULL CHECK (html_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text NOT NULL UNIQUE,
  document_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  billing_document_id uuid UNIQUE REFERENCES public.org_billing_documents(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  CHECK ((status = 'ready') = (billing_document_id IS NOT NULL AND ready_at IS NOT NULL))
);

ALTER TABLE public.platform_invoice_acts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_invoice_acts FROM anon, authenticated;
GRANT SELECT ON public.platform_invoice_acts TO authenticated;
CREATE POLICY "Platform admins read issued act snapshots" ON public.platform_invoice_acts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.is_user_blocked(auth.uid()) IS NOT TRUE);

CREATE FUNCTION public.sintagma_platform_act_source(p_organization_id uuid, p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invoice public.subscription_invoices%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_source jsonb;
  v_override boolean;
  v_existing jsonb;
  v_legacy jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_user_blocked(auth.uid()) IS TRUE THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_invoice FROM public.subscription_invoices
    WHERE id = p_invoice_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_not_found' USING ERRCODE = 'P0002'; END IF;
  v_override := nullif(btrim(v_invoice.buyer_name), '') IS NOT NULL
    OR nullif(btrim(v_invoice.buyer_inn), '') IS NOT NULL
    OR nullif(btrim(v_invoice.buyer_kpp), '') IS NOT NULL;
  v_source := jsonb_build_object(
    'organization_id', v_org.id, 'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number, 'invoice_date', v_invoice.invoice_date,
    'amount_kopecks', (v_invoice.amount * 100)::bigint,
    'plan', v_invoice.plan, 'period_months', v_invoice.period_months,
    'status', v_invoice.status, 'paid_at', v_invoice.paid_at,
    'buyer_is_override', v_override,
    'buyer', jsonb_build_object(
      'name', CASE WHEN v_override THEN nullif(btrim(v_invoice.buyer_name), '') ELSE v_org.name END,
      'inn', CASE WHEN v_override THEN nullif(btrim(v_invoice.buyer_inn), '') ELSE v_org.inn END,
      'kpp', CASE WHEN v_override THEN nullif(btrim(v_invoice.buyer_kpp), '') ELSE v_org.kpp END,
      'director_name', CASE WHEN v_override THEN NULL ELSE v_org.director_name END,
      'director_position', CASE WHEN v_override THEN NULL ELSE v_org.director_position END
    )
  );
  SELECT to_jsonb(a) INTO v_existing FROM public.platform_invoice_acts a
    WHERE a.invoice_id = p_invoice_id AND a.organization_id = p_organization_id;
  IF v_existing->>'status' = 'ready' AND NOT EXISTS (
    SELECT 1 FROM public.org_billing_documents d
      WHERE d.id = (v_existing->>'billing_document_id')::uuid AND d.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'act_in_trash' USING ERRCODE = '22023'; END IF;
  SELECT jsonb_build_object('id', d.id, 'name', d.name, 'file_url', d.file_url,
      'created_at', d.created_at, 'status', 'legacy_existing') INTO v_legacy
    FROM public.org_billing_documents d
    WHERE d.organization_id = p_organization_id AND d.doc_type = 'act' AND d.deleted_at IS NULL
      AND strpos(lower(d.name), chr(8203) || '<inv:' || p_invoice_id::text || '>' || chr(8203)) > 0
    ORDER BY d.created_at, d.id LIMIT 1;
  RETURN jsonb_build_object('source', v_source,
    'source_sha256', encode(sha256(convert_to(v_source::text, 'UTF8')), 'hex'),
    'act_number', 'А-' || v_invoice.invoice_number,
    'existing_act', v_existing, 'legacy_act', v_legacy);
END;
$$;

CREATE FUNCTION public.sintagma_prepare_platform_invoice_act(
  p_organization_id uuid, p_invoice_id uuid, p_request_id uuid,
  p_act_date date, p_source_sha256 text, p_html text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_context jsonb;
  v_existing public.platform_invoice_acts%ROWTYPE;
  v_record public.platform_invoice_acts%ROWTYPE;
  v_id uuid := gen_random_uuid();
  v_number text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_user_blocked(auth.uid()) IS TRUE THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_act_date IS NULL OR p_act_date < DATE '2000-01-01'
    OR p_act_date > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'invalid_act_request' USING ERRCODE = '22023';
  END IF;
  -- Serializes concurrent MCP issuance for this exact invoice. Lock requisites too.
  PERFORM 1 FROM public.subscription_invoices
    WHERE id = p_invoice_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR SHARE;
  SELECT * INTO v_existing FROM public.platform_invoice_acts WHERE request_id = p_request_id;
  IF FOUND AND (v_existing.invoice_id <> p_invoice_id OR v_existing.organization_id <> p_organization_id
      OR v_existing.act_date <> p_act_date) THEN
    RAISE EXCEPTION 'request_id_conflict' USING ERRCODE = '22023';
  END IF;
  v_context := public.sintagma_platform_act_source(p_organization_id, p_invoice_id);
  IF v_context->'legacy_act' <> 'null'::jsonb
    AND coalesce(v_context->'existing_act'->>'status', 'pending') <> 'ready' THEN
    RETURN jsonb_build_object('legacy_act', v_context->'legacy_act', 'replayed', true);
  END IF;
  IF v_context->'existing_act' <> 'null'::jsonb THEN
    RETURN jsonb_build_object('act', v_context->'existing_act', 'replayed', true);
  END IF;
  IF p_source_sha256 IS NULL OR p_source_sha256 <> v_context->>'source_sha256' THEN
    RAISE EXCEPTION 'invoice_source_changed' USING ERRCODE = '40001';
  END IF;
  IF (v_context->'source'->>'amount_kopecks')::bigint <= 0
    OR nullif(btrim(v_context->'source'->'buyer'->>'name'), '') IS NULL
    OR nullif(btrim(v_context->'source'->>'invoice_number'), '') IS NULL THEN
    RAISE EXCEPTION 'invoice_source_incomplete' USING ERRCODE = '22023';
  END IF;
  IF p_html IS NULL OR octet_length(p_html) NOT BETWEEN 100 AND 1048576 THEN
    RAISE EXCEPTION 'invalid_html_snapshot' USING ERRCODE = '22023';
  END IF;
  v_number := v_context->>'act_number';
  INSERT INTO public.platform_invoice_acts (
    id, request_id, organization_id, invoice_id, act_number, act_date,
    source_snapshot, source_sha256, html_snapshot, html_sha256, storage_path,
    document_name, created_by
  ) VALUES (
    v_id, p_request_id, p_organization_id, p_invoice_id, v_number, p_act_date,
    v_context->'source', p_source_sha256, p_html,
    encode(sha256(convert_to(p_html, 'UTF8')), 'hex'),
    p_organization_id::text || '/acts/api/' || v_id::text || '.html',
    'Акт № ' || v_number || ' от ' || to_char(p_act_date, 'DD.MM.YYYY') || ' — Счёт № '
      || (v_context->'source'->>'invoice_number') || ' от '
      || to_char((v_context->'source'->>'invoice_date')::date, 'DD.MM.YYYY')
      || chr(8203) || '<inv:' || p_invoice_id::text || '>' || chr(8203),
    auth.uid()
  ) RETURNING * INTO v_record;
  RETURN jsonb_build_object('act', to_jsonb(v_record), 'replayed', false);
END;
$$;

CREATE FUNCTION public.sintagma_finalize_platform_invoice_act(p_act_id uuid, p_verified_html_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_act public.platform_invoice_acts%ROWTYPE;
  v_doc uuid;
  v_legacy jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_user_blocked(auth.uid()) IS TRUE THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_act FROM public.platform_invoice_acts WHERE id = p_act_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'act_not_found' USING ERRCODE = 'P0002'; END IF;
  -- Same lock order as prepare and the existing-UI marker guard.
  PERFORM 1 FROM public.subscription_invoices WHERE id = v_act.invoice_id FOR UPDATE;
  SELECT * INTO v_act FROM public.platform_invoice_acts WHERE id = p_act_id FOR UPDATE;
  IF p_verified_html_sha256 IS NULL OR p_verified_html_sha256 <> v_act.html_sha256 THEN
    RAISE EXCEPTION 'artifact_hash_mismatch' USING ERRCODE = '22023';
  END IF;
  -- Storage bytes are downloaded and hashed by the MCP before calling this RPC.
  IF NOT EXISTS (SELECT 1 FROM storage.objects
    WHERE bucket_id = 'billing-documents' AND name = v_act.storage_path) THEN
    RAISE EXCEPTION 'artifact_not_uploaded' USING ERRCODE = 'P0002';
  END IF;
  IF v_act.status = 'ready' THEN
    IF NOT EXISTS (SELECT 1 FROM public.org_billing_documents d
      WHERE d.id = v_act.billing_document_id AND d.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'act_in_trash' USING ERRCODE = '22023';
    END IF;
    RETURN to_jsonb(v_act);
  END IF;
  SELECT jsonb_build_object('id', d.id, 'name', d.name, 'file_url', d.file_url,
      'status', 'legacy_existing') INTO v_legacy
    FROM public.org_billing_documents d
    WHERE d.organization_id = v_act.organization_id AND d.doc_type = 'act' AND d.deleted_at IS NULL
      AND strpos(lower(d.name), chr(8203) || '<inv:' || v_act.invoice_id::text || '>' || chr(8203)) > 0
    ORDER BY d.created_at, d.id LIMIT 1;
  IF v_legacy IS NOT NULL THEN RETURN jsonb_build_object('legacy_act', v_legacy); END IF;
  INSERT INTO public.org_billing_documents (organization_id, name, doc_type, file_url, uploaded_by)
    VALUES (v_act.organization_id, v_act.document_name, 'act', v_act.storage_path, auth.uid())
    RETURNING id INTO v_doc;
  UPDATE public.platform_invoice_acts SET status = 'ready', billing_document_id = v_doc, ready_at = now()
    WHERE id = v_act.id RETURNING * INTO v_act;
  RETURN to_jsonb(v_act);
END;
$$;

REVOKE ALL ON FUNCTION public.sintagma_platform_act_source(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sintagma_prepare_platform_invoice_act(uuid, uuid, uuid, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sintagma_finalize_platform_invoice_act(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sintagma_platform_act_source(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sintagma_prepare_platform_invoice_act(uuid, uuid, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sintagma_finalize_platform_invoice_act(uuid, text) TO authenticated;

CREATE FUNCTION public.sintagma_search_billing_organizations(p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_user_blocked(auth.uid()) IS TRUE THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_query IS NULL OR char_length(btrim(p_query)) NOT BETWEEN 1 AND 100
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'invalid_search' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_rows FROM (
    SELECT id, name, inn, kpp FROM public.organizations
    WHERE strpos(lower(name), lower(btrim(p_query))) > 0
      OR strpos(coalesce(inn, ''), btrim(p_query)) > 0
    ORDER BY name, id LIMIT p_limit + 1 OFFSET p_offset
  ) r;
  RETURN jsonb_build_object('organizations', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.sintagma_search_billing_organizations(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sintagma_search_billing_organizations(text, integer, integer) TO authenticated;

-- Existing browser saves insert directly. Serialize only newly written active,
-- invoice-marked acts with MCP writes; historical rows are never rewritten.
CREATE FUNCTION public.guard_platform_invoice_act_marker()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_marker text; v_invoice_id uuid;
BEGIN
  IF NEW.doc_type <> 'act' OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  v_marker := substring(NEW.name FROM chr(8203) || '<inv:([0-9a-fA-F-]{36})>' || chr(8203));
  IF v_marker IS NULL THEN RETURN NEW; END IF;
  v_invoice_id := v_marker::uuid;
  PERFORM 1 FROM public.subscription_invoices
    WHERE id = v_invoice_id AND organization_id = NEW.organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.org_billing_documents d
    WHERE d.organization_id = NEW.organization_id AND d.doc_type = 'act' AND d.deleted_at IS NULL
      AND d.id IS DISTINCT FROM NEW.id
      AND lower(d.name) LIKE '%' || chr(8203) || '<inv:' || v_invoice_id::text || '>' || chr(8203) || '%') THEN
    RAISE EXCEPTION 'invoice_act_already_exists' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_platform_invoice_act_marker() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_platform_invoice_act_marker
  BEFORE INSERT OR UPDATE OF name, organization_id, doc_type, deleted_at ON public.org_billing_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_platform_invoice_act_marker();
