
CREATE OR REPLACE FUNCTION public.delete_signature_comment_by_token(
  p_token text,
  p_comment_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_sig_id uuid;
BEGIN
  SELECT id INTO v_sig_id FROM public.document_signatures WHERE signature_token = p_token;
  IF v_sig_id IS NULL THEN RAISE EXCEPTION 'Invalid token'; END IF;

  DELETE FROM public.signature_comments
  WHERE id = p_comment_id
    AND signature_id = v_sig_id
    AND COALESCE(resolution_status, 'pending') = 'pending';
END;
$$;
