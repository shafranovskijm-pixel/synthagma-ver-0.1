ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS hidden_for_sender boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_for_recipient boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.hide_signature_for_viewer(p_signature_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_sig RECORD;
  v_is_admin boolean;
  v_is_sender_side boolean;
  v_is_recipient_side boolean;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;

  SELECT * INTO v_sig FROM public.document_signatures WHERE id = p_signature_id;
  IF v_sig IS NULL THEN RAISE EXCEPTION 'Signature not found'; END IF;

  v_is_admin := has_role('admin'::app_role, v_user);

  -- Определяем "сторону" вызывающего
  v_is_sender_side := (
    v_user = v_sig.sender_user_id
    OR current_organization_id() = v_sig.organization_id
  );

  v_is_recipient_side := (
    (v_sig.recipient_user_id IS NOT NULL AND v_user = v_sig.recipient_user_id)
    OR (v_sig.recipient_type = 'admin_sintagma' AND v_is_admin)
  );

  IF NOT (v_is_sender_side OR v_is_recipient_side) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_is_sender_side THEN
    UPDATE public.document_signatures
    SET hidden_for_sender = true, updated_at = now()
    WHERE id = p_signature_id;
  END IF;

  IF v_is_recipient_side THEN
    UPDATE public.document_signatures
    SET hidden_for_recipient = true, updated_at = now()
    WHERE id = p_signature_id;
  END IF;
END;
$$;