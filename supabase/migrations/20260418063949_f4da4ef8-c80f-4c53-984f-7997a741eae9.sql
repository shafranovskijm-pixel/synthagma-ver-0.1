CREATE OR REPLACE FUNCTION public.update_signature_revision_html(p_revision_id uuid, p_html text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_sig_id uuid;
  v_sender uuid;
  v_recipient uuid;
  v_is_admin boolean;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;

  SELECT sr.signature_id, ds.sender_user_id, ds.recipient_user_id
  INTO v_sig_id, v_sender, v_recipient
  FROM signature_revisions sr
  JOIN document_signatures ds ON ds.id = sr.signature_id
  WHERE sr.id = p_revision_id;

  IF v_sig_id IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;

  v_is_admin := has_role('admin'::app_role, v_user);

  IF v_user <> v_sender
     AND v_user <> COALESCE(v_recipient, '00000000-0000-0000-0000-000000000000'::uuid)
     AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE signature_revisions
  SET document_html = p_html
  WHERE id = p_revision_id AND (document_html IS NULL OR document_html = '');

  UPDATE document_signatures
  SET document_html = COALESCE(document_html, p_html), updated_at = now()
  WHERE id = v_sig_id AND (document_html IS NULL OR document_html = '');
END;
$function$;