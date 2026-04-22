-- Add 'revoked' as valid status for document_signatures (отзыв документа отправителем)
ALTER TABLE public.document_signatures
  DROP CONSTRAINT IF EXISTS document_signatures_status_check;

ALTER TABLE public.document_signatures
  ADD CONSTRAINT document_signatures_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text, 'sent'::text, 'viewed'::text, 'signed'::text,
    'rejected'::text, 'expired'::text, 'revoked'::text,
    'in_review'::text, 'changes_requested'::text
  ]));

-- RPC: отзыв подписания отправителем (организация-владелец или админ платформы)
CREATE OR REPLACE FUNCTION public.revoke_signature(
  p_signature_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.document_signatures%ROWTYPE;
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_org_member boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO v_row FROM public.document_signatures WHERE id = p_signature_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signature not found';
  END IF;

  -- Уже финальный статус — нечего отзывать
  IF v_row.status IN ('signed', 'rejected', 'revoked') THEN
    RAISE EXCEPTION 'cannot revoke signature in status: %', v_row.status;
  END IF;

  -- Проверка прав: либо отправитель, либо член организации с правом на documents,
  -- либо админ платформы
  v_is_admin := public.has_admin_role(v_caller);
  v_is_org_member := (v_row.sender_user_id = v_caller)
    OR public.has_org_staff_permission(v_caller, v_row.organization_id, 'documents'::text);

  IF NOT (v_is_admin OR v_is_org_member) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.document_signatures
  SET status = 'revoked',
      rejected_at = now(),
      rejection_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Отозвано отправителем'),
      updated_at = now()
  WHERE id = p_signature_id;

  RETURN jsonb_build_object('ok', true, 'signature_id', p_signature_id, 'revoked_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_signature(uuid, text) TO authenticated;
