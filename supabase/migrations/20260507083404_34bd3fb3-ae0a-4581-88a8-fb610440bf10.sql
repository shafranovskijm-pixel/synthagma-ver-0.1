
-- Server-side full delete for organization (admin only)
CREATE OR REPLACE FUNCTION public.admin_delete_organization(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_ids uuid[];
  v_company_ids uuid[];
  v_mp_course_ids uuid[];
BEGIN
  -- Permission check: only global admins
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can delete organizations';
  END IF;

  SELECT array_agg(id) INTO v_course_ids FROM public.courses WHERE organization_id = _org_id;
  SELECT array_agg(id) INTO v_company_ids FROM public.companies WHERE organization_id = _org_id;
  SELECT array_agg(id) INTO v_mp_course_ids FROM public.marketplace_courses WHERE organization_id = _org_id;

  -- Marketplace orders (org as buyer or via its marketplace courses)
  DELETE FROM public.marketplace_orders WHERE buyer_organization_id = _org_id;
  IF v_mp_course_ids IS NOT NULL THEN
    DELETE FROM public.marketplace_orders WHERE marketplace_course_id = ANY(v_mp_course_ids);
    DELETE FROM public.marketplace_course_comments WHERE marketplace_course_id = ANY(v_mp_course_ids);
  END IF;

  -- Course-scoped data (most tables CASCADE on courses but be explicit for safety)
  IF v_course_ids IS NOT NULL THEN
    DELETE FROM public.enrollments WHERE course_id = ANY(v_course_ids);
    DELETE FROM public.course_reminders WHERE course_id = ANY(v_course_ids);
    DELETE FROM public.course_documents WHERE course_id = ANY(v_course_ids);
    DELETE FROM public.course_access_log WHERE course_id = ANY(v_course_ids);
    DELETE FROM public.lessons WHERE course_id = ANY(v_course_ids);
  END IF;

  -- Company-scoped data
  IF v_company_ids IS NOT NULL THEN
    UPDATE public.profiles SET company_id = NULL WHERE company_id = ANY(v_company_ids);
    DELETE FROM public.company_requests WHERE company_id = ANY(v_company_ids);
    DELETE FROM public.company_documents WHERE company_id = ANY(v_company_ids);
    DELETE FROM public.training_plans WHERE company_id = ANY(v_company_ids);
    DELETE FROM public.company_staff WHERE company_id = ANY(v_company_ids);
    DELETE FROM public.staff_invitations WHERE company_id = ANY(v_company_ids);
    DELETE FROM public.role_audit_log WHERE company_id = ANY(v_company_ids);
    UPDATE public.registration_links SET company_id = NULL WHERE company_id = ANY(v_company_ids);
    UPDATE public.course_reminders SET company_id = NULL WHERE company_id = ANY(v_company_ids);
    UPDATE public.webinars SET company_id = NULL WHERE company_id = ANY(v_company_ids);
    UPDATE public.incoming_documents SET related_company_id = NULL WHERE related_company_id = ANY(v_company_ids);
    DELETE FROM public.companies WHERE id = ANY(v_company_ids);
  END IF;

  -- Detach profiles from org
  UPDATE public.profiles SET organization_id = NULL WHERE organization_id = _org_id;

  -- Tables without CASCADE on organization_id
  DELETE FROM public.training_plans WHERE organization_id = _org_id;
  DELETE FROM public.ai_usage_log WHERE organization_id = _org_id;

  -- Final delete (CASCADE handles the rest)
  DELETE FROM public.organizations WHERE id = _org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_organization(uuid) TO authenticated;

-- Server-side full delete for a company (organization-scope or admin)
CREATE OR REPLACE FUNCTION public.admin_delete_company(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.companies WHERE id = _company_id;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Permission: global admin OR org staff with documents/manage rights OR org owner profile
  IF NOT (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND organization_id = v_org_id)
    OR public.has_org_staff_permission(auth.uid(), v_org_id, 'documents.manage')
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to delete company';
  END IF;

  UPDATE public.profiles SET company_id = NULL WHERE company_id = _company_id;
  DELETE FROM public.company_requests WHERE company_id = _company_id;
  DELETE FROM public.company_documents WHERE company_id = _company_id;
  DELETE FROM public.training_plans WHERE company_id = _company_id;
  DELETE FROM public.company_staff WHERE company_id = _company_id;
  DELETE FROM public.staff_invitations WHERE company_id = _company_id;
  DELETE FROM public.role_audit_log WHERE company_id = _company_id;
  UPDATE public.registration_links SET company_id = NULL WHERE company_id = _company_id;
  UPDATE public.course_reminders SET company_id = NULL WHERE company_id = _company_id;
  UPDATE public.webinars SET company_id = NULL WHERE company_id = _company_id;
  UPDATE public.incoming_documents SET related_company_id = NULL WHERE related_company_id = _company_id;

  DELETE FROM public.companies WHERE id = _company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_company(uuid) TO authenticated;
