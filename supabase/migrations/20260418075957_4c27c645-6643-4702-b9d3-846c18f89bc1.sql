
ALTER TABLE public.signature_comments
  ADD COLUMN IF NOT EXISTS resolution_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS org_reply text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signature_comments_resolution_status_check'
  ) THEN
    ALTER TABLE public.signature_comments
      ADD CONSTRAINT signature_comments_resolution_status_check
      CHECK (resolution_status IN ('pending','accepted','rejected'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_signature_comment_resolution(
  p_comment_id uuid,
  p_resolution_status text,
  p_org_reply text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_sig_org uuid;
  v_sig_sender uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  IF p_resolution_status NOT IN ('pending','accepted','rejected') THEN
    RAISE EXCEPTION 'Invalid resolution_status';
  END IF;
  SELECT ds.organization_id, ds.sender_user_id INTO v_sig_org, v_sig_sender
  FROM signature_comments sc
  JOIN document_signatures ds ON ds.id = sc.signature_id
  WHERE sc.id = p_comment_id;
  IF v_sig_org IS NULL THEN RAISE EXCEPTION 'Comment not found'; END IF;
  IF NOT (
    v_user = v_sig_sender
    OR current_organization_id() = v_sig_org
    OR has_role('admin'::app_role, v_user)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE signature_comments
  SET resolution_status = p_resolution_status,
      org_reply = COALESCE(p_org_reply, org_reply),
      resolved = (p_resolution_status <> 'pending'),
      resolved_at = CASE WHEN p_resolution_status <> 'pending' THEN now() ELSE NULL END,
      resolved_by = CASE WHEN p_resolution_status <> 'pending' THEN v_user ELSE NULL END
  WHERE id = p_comment_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_signature_comments_by_token(text);

CREATE OR REPLACE FUNCTION public.get_signature_comments_by_token(p_token text)
RETURNS TABLE(
  id uuid,
  revision_id uuid,
  author_name text,
  author_role text,
  quoted_text text,
  comment_text text,
  position_anchor jsonb,
  resolved boolean,
  resolution_status text,
  org_reply text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT sc.id, sc.revision_id, sc.author_name, sc.author_role,
         sc.quoted_text, sc.comment_text, sc.position_anchor,
         sc.resolved, sc.resolution_status, sc.org_reply, sc.created_at
  FROM public.signature_comments sc
  JOIN public.document_signatures ds ON ds.id = sc.signature_id
  WHERE ds.signature_token = p_token
  ORDER BY sc.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.org_finalize_signature_review(
  p_signature_id uuid,
  p_action text,
  p_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_sig RECORD;
  v_title text;
  v_body text;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  SELECT * INTO v_sig FROM document_signatures WHERE id = p_signature_id;
  IF v_sig IS NULL THEN RAISE EXCEPTION 'Signature not found'; END IF;
  IF NOT (
    v_user = v_sig.sender_user_id
    OR current_organization_id() = v_sig.organization_id
    OR has_role('admin'::app_role, v_user)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_action = 'reject_all' THEN
    UPDATE document_signatures
    SET status = 'in_review', rejection_reason = COALESCE(p_message, rejection_reason), updated_at = now()
    WHERE id = p_signature_id;
    UPDATE signature_comments
    SET resolution_status = 'rejected', resolved = true, resolved_at = now(), resolved_by = v_user,
        org_reply = COALESCE(p_message, org_reply)
    WHERE signature_id = p_signature_id AND resolution_status = 'pending';
    v_title := 'Правки по документу отклонены';
    v_body := v_sig.document_title || COALESCE(' — ' || p_message, '');
  ELSIF p_action = 'send_new_version' THEN
    UPDATE document_signatures
    SET status = 'in_review', updated_at = now()
    WHERE id = p_signature_id;
    v_title := 'Отправлена новая версия документа';
    v_body := v_sig.document_title || COALESCE(' — ' || p_message, '');
  ELSIF p_action = 'sign_as_is' THEN
    UPDATE signature_comments
    SET resolution_status = 'accepted', resolved = true, resolved_at = now(), resolved_by = v_user
    WHERE signature_id = p_signature_id AND resolution_status = 'pending';
    v_title := 'Документ подписан организацией';
    v_body := v_sig.document_title;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;

  IF v_sig.recipient_user_id IS NOT NULL THEN
    INSERT INTO org_notifications (organization_id, user_id, type, title, message, related_id)
    VALUES (v_sig.organization_id, v_sig.recipient_user_id, 'signature', v_title, v_body, p_signature_id);
  END IF;
END;
$$;
