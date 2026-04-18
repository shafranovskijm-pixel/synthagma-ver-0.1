CREATE OR REPLACE FUNCTION public.org_finalize_signature_review(p_signature_id uuid, p_action text, p_message text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_sig RECORD;
  v_title text;
  v_body text;
  v_accepted int;
  v_rejected int;
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
  ELSIF p_action = 'send_decisions' THEN
    -- Возвращаем документ клиенту на просмотр решений организации.
    -- Все нерассмотренные правки остаются "pending" — клиент видит явно.
    UPDATE document_signatures
    SET status = 'in_review', updated_at = now()
    WHERE id = p_signature_id;

    SELECT
      COUNT(*) FILTER (WHERE resolution_status = 'accepted'),
      COUNT(*) FILTER (WHERE resolution_status = 'rejected')
    INTO v_accepted, v_rejected
    FROM signature_comments
    WHERE signature_id = p_signature_id;

    v_title := 'Организация рассмотрела ваши правки';
    v_body := v_sig.document_title
      || ' — принято: ' || COALESCE(v_accepted, 0)
      || ', отклонено: ' || COALESCE(v_rejected, 0)
      || COALESCE('. Сообщение: ' || p_message, '');
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;

  IF v_sig.recipient_user_id IS NOT NULL THEN
    INSERT INTO org_notifications (organization_id, user_id, type, title, message, related_id)
    VALUES (v_sig.organization_id, v_sig.recipient_user_id, 'signature', v_title, v_body, p_signature_id);
  END IF;
END;
$function$;