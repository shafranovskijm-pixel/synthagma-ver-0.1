-- 1. Improve current_organization_id with org_staff fallback
CREATE OR REPLACE FUNCTION public.current_organization_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_org IS NOT NULL THEN
    RETURN v_org;
  END IF;
  SELECT organization_id INTO v_org FROM public.org_staff WHERE user_id = auth.uid() ORDER BY created_at ASC LIMIT 1;
  RETURN v_org;
END;
$function$;

-- 2. RPC create_external_contract_signature with p_organization_id fallback
CREATE OR REPLACE FUNCTION public.create_external_contract_signature(
  p_file_url text,
  p_file_name text,
  p_file_mime text,
  p_document_title text,
  p_admin_email text,
  p_admin_name text DEFAULT 'Администратор Синтагма'::text,
  p_summary text DEFAULT NULL::text,
  p_organization_id uuid DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_sender uuid;
  v_sender_name text;
  v_sig_id uuid;
  v_rev_id uuid;
  v_is_member boolean;
BEGIN
  v_sender := auth.uid();
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;

  IF p_organization_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.profiles WHERE user_id = v_sender AND organization_id = p_organization_id
      UNION ALL
      SELECT 1 FROM public.org_staff WHERE user_id = v_sender AND organization_id = p_organization_id
    ) INTO v_is_member;

    IF v_is_member THEN
      v_org_id := p_organization_id;
    END IF;
  END IF;

  IF v_org_id IS NULL THEN
    v_org_id := current_organization_id();
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization: пользователь не привязан к организации (profiles/org_staff)';
  END IF;

  SELECT COALESCE(full_name, email, 'Организация') INTO v_sender_name FROM profiles WHERE user_id = v_sender LIMIT 1;
  IF v_sender_name IS NULL THEN
    SELECT COALESCE(display_name, 'Организация') INTO v_sender_name FROM org_staff WHERE user_id = v_sender LIMIT 1;
  END IF;

  INSERT INTO document_signatures (
    organization_id, sender_user_id, sender_name,
    document_type, document_title,
    recipient_type, recipient_email, recipient_name,
    status, mode, requires_bilateral
  ) VALUES (
    v_org_id, v_sender, COALESCE(v_sender_name, 'Организация'),
    'external_upload', p_document_title,
    'admin_sintagma', p_admin_email, p_admin_name,
    'in_review', 'review', true
  ) RETURNING id INTO v_sig_id;

  INSERT INTO signature_revisions (
    signature_id, version, document_html, document_hash,
    file_url, file_name, file_mime,
    created_by, created_by_name, change_summary
  ) VALUES (
    v_sig_id, 1, NULL, NULL,
    p_file_url, p_file_name, p_file_mime,
    v_sender, COALESCE(v_sender_name, 'Организация'), COALESCE(p_summary, 'Первоначальная версия')
  ) RETURNING id INTO v_rev_id;

  UPDATE document_signatures SET current_revision_id = v_rev_id WHERE id = v_sig_id;
  RETURN v_sig_id;
END;
$function$;