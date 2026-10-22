CREATE OR REPLACE FUNCTION public.get_documents_kpi(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  IF NOT public.uc_document_scope_allowed(p_organization_id,NULL,NULL) THEN RAISE EXCEPTION 'organization_wide_document_scope_required' USING ERRCODE='42501'; END IF;
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
$function$
