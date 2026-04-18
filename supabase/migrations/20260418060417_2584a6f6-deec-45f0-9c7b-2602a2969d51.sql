
-- Drop old function with different return type first
DROP FUNCTION IF EXISTS public.get_signature_revisions_by_token(text);

-- 1. Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'external-contracts','external-contracts', false, 20971520,
  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Org members upload external contracts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'external-contracts' AND (storage.foldername(name))[1] = (current_organization_id())::text);

CREATE POLICY "Org members read own external contracts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'external-contracts' AND ((storage.foldername(name))[1] = (current_organization_id())::text OR has_role('admin'::app_role, auth.uid())));

CREATE POLICY "Org members delete own external contracts"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'external-contracts' AND (storage.foldername(name))[1] = (current_organization_id())::text);

CREATE POLICY "Admins update external contracts"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'external-contracts' AND has_role('admin'::app_role, auth.uid()));

-- 2. File fields on revisions
ALTER TABLE public.signature_revisions
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_mime text;

-- 3. Bilateral
ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS sender_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sender_signed_ip text,
  ADD COLUMN IF NOT EXISTS sender_signed_user_agent text,
  ADD COLUMN IF NOT EXISTS requires_bilateral boolean NOT NULL DEFAULT false;

-- 4. Create external contract signature
CREATE OR REPLACE FUNCTION public.create_external_contract_signature(
  p_file_url text, p_file_name text, p_file_mime text,
  p_document_title text, p_admin_email text,
  p_admin_name text DEFAULT 'Администратор Синтагма',
  p_summary text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id uuid; v_sender uuid; v_sender_name text; v_sig_id uuid; v_rev_id uuid;
BEGIN
  v_sender := auth.uid();
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  v_org_id := current_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'No organization'; END IF;
  SELECT COALESCE(full_name, email, 'Организация') INTO v_sender_name FROM profiles WHERE user_id = v_sender LIMIT 1;

  INSERT INTO document_signatures (
    organization_id, sender_user_id, sender_name,
    document_type, document_title,
    recipient_type, recipient_email, recipient_name,
    status, mode, requires_bilateral
  ) VALUES (
    v_org_id, v_sender, v_sender_name,
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
    v_sender, v_sender_name, COALESCE(p_summary, 'Первоначальная версия')
  ) RETURNING id INTO v_rev_id;

  UPDATE document_signatures SET current_revision_id = v_rev_id WHERE id = v_sig_id;
  RETURN v_sig_id;
END; $$;

-- 5. Add new revision
CREATE OR REPLACE FUNCTION public.add_signature_revision(
  p_signature_id uuid,
  p_file_url text DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_file_mime text DEFAULT NULL,
  p_document_html text DEFAULT NULL,
  p_change_summary text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid; v_user_name text; v_sig RECORD; v_next_version int; v_rev_id uuid; v_is_admin boolean;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  SELECT * INTO v_sig FROM document_signatures WHERE id = p_signature_id;
  IF v_sig IS NULL THEN RAISE EXCEPTION 'Signature not found'; END IF;
  v_is_admin := has_role('admin'::app_role, v_user);
  IF v_user <> v_sig.sender_user_id AND NOT v_is_admin
     AND v_user <> COALESCE(v_sig.recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT COALESCE(full_name, email, 'Пользователь') INTO v_user_name FROM profiles WHERE user_id = v_user LIMIT 1;
  IF v_user_name IS NULL AND v_is_admin THEN v_user_name := 'Администратор Синтагма'; END IF;
  SELECT COALESCE(MAX(version),0)+1 INTO v_next_version FROM signature_revisions WHERE signature_id = p_signature_id;

  INSERT INTO signature_revisions (
    signature_id, version, document_html, file_url, file_name, file_mime,
    created_by, created_by_name, change_summary
  ) VALUES (
    p_signature_id, v_next_version, p_document_html, p_file_url, p_file_name, p_file_mime,
    v_user, v_user_name, p_change_summary
  ) RETURNING id INTO v_rev_id;

  UPDATE document_signatures
  SET current_revision_id = v_rev_id, status = 'in_review', updated_at = now()
  WHERE id = p_signature_id;

  IF v_user <> v_sig.sender_user_id THEN
    INSERT INTO org_notifications (organization_id, user_id, type, title, message, related_id)
    VALUES (
      v_sig.organization_id, v_sig.sender_user_id, 'signature',
      'Новая версия документа от ' || v_user_name,
      v_sig.document_title || COALESCE(' — ' || p_change_summary, ''),
      p_signature_id
    );
  END IF;
  RETURN v_rev_id;
END; $$;

-- 6. Sender countersign
CREATE OR REPLACE FUNCTION public.sender_countersign(
  p_signature_id uuid, p_ip text DEFAULT NULL, p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid; v_sig RECORD;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  SELECT * INTO v_sig FROM document_signatures WHERE id = p_signature_id;
  IF v_sig IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_user <> v_sig.sender_user_id THEN RAISE EXCEPTION 'Only sender can countersign'; END IF;
  IF v_sig.status <> 'signed' THEN RAISE EXCEPTION 'Recipient must sign first'; END IF;
  UPDATE document_signatures
  SET sender_signed_at = now(), sender_signed_ip = p_ip,
      sender_signed_user_agent = p_user_agent, updated_at = now()
  WHERE id = p_signature_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_external_contract_signature(text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_signature_revision(uuid,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sender_countersign(uuid,text,text) TO authenticated;

-- 7. Recreate get_signature_revisions_by_token with file fields
CREATE OR REPLACE FUNCTION public.get_signature_revisions_by_token(p_token text)
RETURNS TABLE(
  id uuid, version integer,
  document_html text, document_hash text,
  file_url text, file_name text, file_mime text,
  created_by_name text, change_summary text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT sr.id, sr.version, sr.document_html, sr.document_hash,
         sr.file_url, sr.file_name, sr.file_mime,
         sr.created_by_name, sr.change_summary, sr.created_at
  FROM public.signature_revisions sr
  JOIN public.document_signatures ds ON ds.id = sr.signature_id
  WHERE ds.signature_token = p_token
  ORDER BY sr.version ASC;
END; $$;
