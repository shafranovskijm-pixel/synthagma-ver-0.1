-- Staff document lifecycle and manual journals. Prepared offline only.
-- Apply after 20261012110000_staff_workspace_access, in one transaction.
-- Existing business aggregation/whitelist/pagination remain unchanged except
-- scoped read filters, permission checks, and truthful UPDATE row-count results.
DO $preflight$
BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES
  ('public.can_access_organization(uuid,text)','ad720ba20dc32362ed009b2917cc2d9c'),
  ('public.account_deletion_access_allowed()','6c078d0f1aa1f6b5af15485f0eaccb2a'),
  ('public.get_documents_kpi(uuid)','81f938320b6634424e7f59b447d85327'),
  ('public.list_recycle_bin(uuid,text,integer,integer)','1d8277c8135addea5207857d8a2af842'),
  ('public.soft_delete_document(text,uuid)','7a540b6f27ec6cb8d9e0c813b2f4e324'),
  ('public.restore_document(text,uuid)','9eff9285f82b895a746100f18883bffc')
 ) expected(signature,body_md5) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
 WHERE p.oid IS NULL OR md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))<>expected.body_md5)
 THEN RAISE EXCEPTION 'Unreviewed document helpers; capture live definitions before applying'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES('journal_instances'),('journal_entries')) t(name)
 WHERE NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=t.name AND c.relrowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name
 AND p.policyname='account_deletion_no_revoked_access' AND p.permissive='RESTRICTIVE' AND p.cmd='ALL'))
 THEN RAISE EXCEPTION 'Journal RLS/deletion fence missing'; END IF;
END;
$preflight$;


CREATE OR REPLACE FUNCTION public.get_documents_kpi(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_current_org uuid;
  v_now timestamptz := now();
  v_month_start timestamptz := date_trunc('month', v_now);
  v_in30 timestamptz := v_now + interval '30 days';
  v_six_months_ago timestamptz := date_trunc('month', v_now - interval '5 months');
  v_result jsonb;
  v_sig_total int; v_sig_signed int; v_sig_pending int;
  v_sig_expired int; v_sig_rejected int;
  v_edu_total int; v_edu_month int; v_dup int; v_cancel int;
  v_expiring int; v_expired int;
  v_contracts_total int; v_contracts_signed int; v_contracts_pending int;
  v_prop_total int; v_prop_accepted int;
  v_pd_open int; v_pd_overdue int;
  v_inc_total int; v_inc_month int;
  v_monthly_sigs jsonb; v_monthly_edu jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'Authentication required or account access revoked' USING ERRCODE='42501';
  END IF;
  IF NOT public.can_access_organization(p_organization_id,'documents.read') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;

  -- Подписания
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL),
    count(*) FILTER (WHERE deleted_at IS NULL AND status = 'signed'),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('sent','viewed')),
    count(*) FILTER (WHERE deleted_at IS NULL AND status = 'expired'),
    count(*) FILTER (WHERE deleted_at IS NULL AND status = 'rejected'),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('sent','viewed') AND expires_at <= v_in30 AND expires_at >= v_now),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('sent','viewed') AND expires_at < v_now)
  INTO v_sig_total, v_sig_signed, v_sig_pending, v_sig_expired, v_sig_rejected, v_expiring, v_expired
  FROM public.document_signatures
  WHERE organization_id = p_organization_id;

  -- Документы об образовании
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL),
    count(*) FILTER (WHERE deleted_at IS NULL AND created_at >= v_month_start),
    count(*) FILTER (WHERE deleted_at IS NULL AND document_status = 'duplicate'),
    count(*) FILTER (WHERE deleted_at IS NULL AND document_status = 'cancelled')
  INTO v_edu_total, v_edu_month, v_dup, v_cancel
  FROM public.education_document_records
  WHERE organization_id = p_organization_id;

  -- Договоры с контрагентами (через JOIN с companies для org-фильтра)
  SELECT
    count(*) FILTER (WHERE cd.deleted_at IS NULL AND cd.type = 'contract'),
    count(*) FILTER (WHERE cd.deleted_at IS NULL AND cd.type = 'contract' AND cd.is_paid = true),
    count(*) FILTER (WHERE cd.deleted_at IS NULL AND cd.type = 'contract' AND COALESCE(cd.is_paid, false) = false)
  INTO v_contracts_total, v_contracts_signed, v_contracts_pending
  FROM public.company_documents cd
  JOIN public.companies c ON c.id = cd.company_id
  WHERE c.organization_id = p_organization_id;

  -- КП
  IF public.can_access_organization(p_organization_id,'sales.read') THEN
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('accepted','signed'))
  INTO v_prop_total, v_prop_accepted
  FROM public.commercial_proposals
  WHERE organization_id = p_organization_id;
  ELSE
    v_prop_total := NULL;
    v_prop_accepted := NULL;
  END IF;

  -- Запросы ПД
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('new','in_progress')),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('new','in_progress') AND due_date < v_now::date)
  INTO v_pd_open, v_pd_overdue
  FROM public.data_subject_requests
  WHERE organization_id = p_organization_id;

  -- Входящие
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL),
    count(*) FILTER (WHERE deleted_at IS NULL AND created_at >= v_month_start)
  INTO v_inc_total, v_inc_month
  FROM public.incoming_documents
  WHERE organization_id = p_organization_id;

  -- Тренд подписаний (6 мес.)
  WITH months AS (
    SELECT date_trunc('month', v_six_months_ago + (n || ' month')::interval) AS m
    FROM generate_series(0, 5) n
  ),
  sigs AS (
    SELECT date_trunc('month', created_at) AS m_sent,
           date_trunc('month', signed_at) AS m_signed
    FROM public.document_signatures
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
      AND (created_at >= v_six_months_ago OR signed_at >= v_six_months_ago)
  )
  SELECT jsonb_agg(jsonb_build_object(
    'month', to_char(months.m, 'TMMon YY'),
    'sent', COALESCE((SELECT count(*) FROM sigs WHERE m_sent = months.m), 0),
    'signed', COALESCE((SELECT count(*) FROM sigs WHERE m_signed = months.m), 0)
  ) ORDER BY months.m)
  INTO v_monthly_sigs FROM months;

  -- Тренд документов об образовании (6 мес.)
  WITH months AS (
    SELECT date_trunc('month', v_six_months_ago + (n || ' month')::interval) AS m
    FROM generate_series(0, 5) n
  )
  SELECT jsonb_agg(jsonb_build_object(
    'month', to_char(months.m, 'TMMon YY'),
    'count', COALESCE((
      SELECT count(*) FROM public.education_document_records
      WHERE organization_id = p_organization_id
        AND deleted_at IS NULL
        AND date_trunc('month', created_at) = months.m
    ), 0)
  ) ORDER BY months.m)
  INTO v_monthly_edu FROM months;

  v_result := jsonb_build_object(
    'signatures_total', v_sig_total,
    'signatures_signed', v_sig_signed,
    'signatures_pending', v_sig_pending,
    'signatures_expired', v_sig_expired,
    'signatures_rejected', v_sig_rejected,
    'signing_conversion', CASE WHEN v_sig_total > 0 THEN round((v_sig_signed::numeric / v_sig_total) * 100) ELSE 0 END,
    'education_docs_total', v_edu_total,
    'education_docs_this_month', v_edu_month,
    'duplicates_count', v_dup,
    'cancelled_count', v_cancel,
    'expiring_soon', v_expiring,
    'expired_count', v_expired,
    'contracts_total', v_contracts_total,
    'contracts_signed', v_contracts_signed,
    'contracts_pending', v_contracts_pending,
    'proposals_total', v_prop_total,
    'proposals_accepted', v_prop_accepted,
    'proposal_to_contract_conversion', CASE WHEN v_prop_total IS NULL THEN NULL WHEN v_prop_total > 0 THEN round((v_prop_accepted::numeric / v_prop_total) * 100) ELSE 0 END,
    'pd_requests_open', v_pd_open,
    'pd_requests_overdue', v_pd_overdue,
    'incoming_total', v_inc_total,
    'incoming_this_month', v_inc_month,
    'monthly_signatures', COALESCE(v_monthly_sigs, '[]'::jsonb),
    'monthly_education_docs', COALESCE(v_monthly_edu, '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_documents_kpi(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_documents_kpi(uuid) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.list_recycle_bin(
  p_organization_id uuid,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  source_table text,
  display_name text,
  type_label text,
  meta text,
  deleted_at timestamptz,
  deleted_by uuid,
  organization_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_current_org uuid;
  v_q text := COALESCE(NULLIF(trim(p_search), ''), NULL);
  v_search_pat text;
BEGIN
  IF v_user IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'Authentication required or account access revoked' USING ERRCODE='42501';
  END IF;
  IF NOT public.can_access_organization(p_organization_id,'documents.read') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;

  v_search_pat := CASE WHEN v_q IS NULL THEN NULL ELSE '%' || lower(v_q) || '%' END;

  RETURN QUERY
  WITH all_items AS (
    -- education_document_records
    SELECT r.id,
           'education_document_records'::text AS source_table,
           (r.full_name || ' — ' || r.reg_number)::text AS display_name,
           'Документ об образовании'::text AS type_label,
           r.document_type::text AS meta,
           r.deleted_at, r.deleted_by, r.organization_id
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'org_documents', r.name, 'Документ организации', r.type, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.org_documents r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT cd.id, 'company_documents', cd.name, 'Документ контрагента', cd.type, cd.deleted_at, cd.deleted_by, c.organization_id
    FROM public.company_documents cd
    JOIN public.companies c ON c.id = cd.company_id
    WHERE c.organization_id = p_organization_id AND cd.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'document_signatures',
           (r.document_title || ' → ' || r.recipient_email)::text,
           'Подписание (ПЭП)', r.document_type, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.document_signatures r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'data_subject_requests',
           ('Запрос: ' || r.request_type)::text,
           'Запрос ПД (152-ФЗ)', r.status, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.data_subject_requests r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'incoming_documents',
           (COALESCE(r.title, r.doc_type) || COALESCE(' от ' || r.counterparty_name, ''))::text,
           'Входящий документ', r.doc_type, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.incoming_documents r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'document_issuance_log',
           (r.document_name || ' — ' || r.user_name)::text,
           'Запись журнала выдачи', NULL, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.document_issuance_log r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'commercial_proposals',
           ('КП: ' || r.company_name || ' (' || r.total_amount::text || ' ₽)')::text,
           'Коммерческое предложение', NULL, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.commercial_proposals r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL
      AND public.can_access_organization(p_organization_id,'sales.read')

    UNION ALL
    SELECT r.id, 'org_billing_documents', r.name, 'Счёт / Акт', r.doc_type, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.org_billing_documents r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL
      AND public.can_access_organization(p_organization_id,'billing.read')
  ),
  filtered AS (
    SELECT ai.* FROM all_items ai
    WHERE v_search_pat IS NULL
       OR lower(ai.display_name) LIKE v_search_pat
       OR lower(ai.type_label) LIKE v_search_pat
       OR lower(COALESCE(ai.meta, '')) LIKE v_search_pat
  ),
  counted AS (
    SELECT *, count(*) OVER () AS total_count FROM filtered
  )
  SELECT counted.id, counted.source_table, counted.display_name, counted.type_label,
         counted.meta, counted.deleted_at, counted.deleted_by, counted.organization_id, counted.total_count
  FROM counted
  ORDER BY counted.deleted_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_recycle_bin(uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_recycle_bin(uuid,text,integer,integer) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.soft_delete_document(p_table text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_query TEXT;
  v_org_id UUID;
  v_company_org UUID;
  v_is_admin BOOLEAN;
  v_current_org UUID;
  v_affected bigint;
  v_required_permission text := CASE p_table
    WHEN 'org_billing_documents' THEN 'billing.write'
    WHEN 'commercial_proposals' THEN 'sales.write'
    ELSE 'documents.write' END;
  v_allowed_tables TEXT[] := ARRAY[
    'education_document_records',
    'org_documents',
    'company_documents',
    'document_signatures',
    'data_subject_requests',
    'incoming_documents',
    'document_issuance_log',
    'commercial_proposals',
    'org_billing_documents'
  ];
BEGIN
  IF v_user IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'Authentication required or account access revoked' USING ERRCODE='42501';
  END IF;
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not allowed for soft-delete', p_table;
  END IF;


  IF p_table = 'company_documents' THEN
    SELECT c.organization_id INTO v_company_org
    FROM public.company_documents cd
    JOIN public.companies c ON c.id = cd.company_id
    WHERE cd.id = p_id;
    IF NOT public.can_access_organization(v_company_org,v_required_permission) THEN
      RAISE EXCEPTION 'Forbidden: insufficient permission' USING ERRCODE='42501';
    END IF;
  ELSE
    v_query := format('SELECT organization_id FROM public.%I WHERE id = $1', p_table);
    EXECUTE v_query INTO v_org_id USING p_id;
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Document not found';
    END IF;
    IF NOT public.can_access_organization(v_org_id,v_required_permission) THEN
      RAISE EXCEPTION 'Forbidden: insufficient permission' USING ERRCODE='42501';
    END IF;
  END IF;

  v_query := format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
    p_table
  );
  EXECUTE v_query USING v_user, p_id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.soft_delete_document(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_document(text,uuid) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.restore_document(p_table text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_query TEXT;
  v_org_id UUID;
  v_company_org UUID;
  v_is_admin BOOLEAN;
  v_current_org UUID;
  v_affected bigint;
  v_required_permission text := CASE p_table
    WHEN 'org_billing_documents' THEN 'billing.write'
    WHEN 'commercial_proposals' THEN 'sales.write'
    ELSE 'documents.write' END;
  v_allowed_tables TEXT[] := ARRAY[
    'education_document_records',
    'org_documents',
    'company_documents',
    'document_signatures',
    'data_subject_requests',
    'incoming_documents',
    'document_issuance_log',
    'commercial_proposals',
    'org_billing_documents'
  ];
BEGIN
  IF v_user IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'Authentication required or account access revoked' USING ERRCODE='42501';
  END IF;
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not allowed', p_table;
  END IF;


  -- Verify ownership before restore
  IF p_table = 'company_documents' THEN
    SELECT c.organization_id INTO v_company_org
    FROM public.company_documents cd
    JOIN public.companies c ON c.id = cd.company_id
    WHERE cd.id = p_id;
    IF NOT public.can_access_organization(v_company_org,v_required_permission) THEN
      RAISE EXCEPTION 'Forbidden: insufficient permission' USING ERRCODE='42501';
    END IF;
  ELSE
    v_query := format('SELECT organization_id FROM public.%I WHERE id = $1', p_table);
    EXECUTE v_query INTO v_org_id USING p_id;
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Document not found';
    END IF;
    IF NOT public.can_access_organization(v_org_id,v_required_permission) THEN
      RAISE EXCEPTION 'Forbidden: insufficient permission' USING ERRCODE='42501';
    END IF;
  END IF;

  v_query := format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1',
    p_table
  );
  EXECUTE v_query USING p_id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_document(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_document(text,uuid) TO authenticated,service_role;


DROP POLICY IF EXISTS "Organization members can view their journal instances" ON public.journal_instances;
CREATE POLICY "Organization members can view their journal instances" ON public.journal_instances
 FOR SELECT TO authenticated
 USING (public.can_access_organization(organization_id,'journals.read'));

DROP POLICY IF EXISTS "Organization members can create journal instances" ON public.journal_instances;
CREATE POLICY "Organization members can create journal instances" ON public.journal_instances
 FOR INSERT TO authenticated
 WITH CHECK (public.can_access_organization(organization_id,'journals.write'));

DROP POLICY IF EXISTS "Organization members can update journal instances" ON public.journal_instances;
CREATE POLICY "Organization members can update journal instances" ON public.journal_instances
 FOR UPDATE TO authenticated
 USING (public.can_access_organization(organization_id,'journals.write'))
 WITH CHECK (public.can_access_organization(organization_id,'journals.write'));

DROP POLICY IF EXISTS "Organization members can delete journal instances" ON public.journal_instances;
CREATE POLICY "Organization members can delete journal instances" ON public.journal_instances
 FOR DELETE TO authenticated
 USING (public.can_access_organization(organization_id,'journals.write'));

DROP POLICY IF EXISTS "Organization members can view their journal entries" ON public.journal_entries;
CREATE POLICY "Organization members can view their journal entries" ON public.journal_entries
 FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_id AND public.can_access_organization(j.organization_id,'journals.read')));

DROP POLICY IF EXISTS "Organization members can create journal entries" ON public.journal_entries;
CREATE POLICY "Organization members can create journal entries" ON public.journal_entries
 FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_id AND public.can_access_organization(j.organization_id,'journals.write')));

DROP POLICY IF EXISTS "Organization members can update journal entries" ON public.journal_entries;
CREATE POLICY "Organization members can update journal entries" ON public.journal_entries
 FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_id AND public.can_access_organization(j.organization_id,'journals.write')))
 WITH CHECK (EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_id AND public.can_access_organization(j.organization_id,'journals.write')));

DROP POLICY IF EXISTS "Organization members can delete journal entries" ON public.journal_entries;
CREATE POLICY "Organization members can delete journal entries" ON public.journal_entries
 FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_id AND public.can_access_organization(j.organization_id,'journals.write')));

NOTIFY pgrst,'reload schema';
