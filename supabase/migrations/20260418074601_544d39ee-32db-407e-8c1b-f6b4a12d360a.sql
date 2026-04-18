-- 1) Stop creating notification per individual comment
CREATE OR REPLACE FUNCTION public.add_signature_comment_by_token(
  p_token text,
  p_author_name text,
  p_quoted_text text,
  p_comment_text text,
  p_position_anchor jsonb DEFAULT NULL::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sig_id uuid;
  v_rev_id uuid;
  v_new_id uuid;
BEGIN
  SELECT ds.id, ds.current_revision_id
  INTO v_sig_id, v_rev_id
  FROM public.document_signatures ds
  WHERE ds.signature_token = p_token AND ds.mode = 'review';

  IF v_sig_id IS NULL THEN RAISE EXCEPTION 'Signature not found or not in review mode'; END IF;

  INSERT INTO public.signature_comments (signature_id, revision_id, author_name, author_role, quoted_text, comment_text, position_anchor)
  VALUES (v_sig_id, v_rev_id, COALESCE(p_author_name, 'Получатель'), 'recipient', p_quoted_text, p_comment_text, p_position_anchor)
  RETURNING id INTO v_new_id;

  -- Per-comment notifications intentionally removed.
  -- Aggregate notification is created when status flips to 'changes_requested'
  -- via the notify_on_signature_event trigger.
  RETURN v_new_id;
END;
$function$;

-- 2) Aggregate notification: include count of edits/comments
CREATE OR REPLACE FUNCTION public.notify_on_signature_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_msg text;
  v_admin_title text;
  v_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('sent','in_review') THEN
      INSERT INTO public.org_notifications (organization_id, user_id, type, title, message, related_id)
      VALUES (
        NEW.organization_id,
        NEW.sender_user_id,
        'signature',
        CASE WHEN NEW.status='in_review' THEN 'Документ отправлен на согласование' ELSE 'Документ отправлен на подписание' END,
        'Получатель: ' || NEW.recipient_name || ' (' || NEW.recipient_email || ') — ' || NEW.document_title,
        NEW.id
      );
      IF NEW.recipient_user_id IS NOT NULL THEN
        INSERT INTO public.org_notifications (organization_id, user_id, type, title, message, related_id)
        VALUES (
          NEW.organization_id,
          NEW.recipient_user_id,
          'signature',
          CASE WHEN NEW.status='in_review' THEN 'Вам документ на согласование' ELSE 'Вам документ на подписание' END,
          NEW.document_title || ' — от ' || COALESCE(NEW.sender_name,'организации'),
          NEW.id
        );
      END IF;
      IF NEW.recipient_type = 'admin_sintagma' THEN
        INSERT INTO public.admin_notifications (type, title, message, related_entity_id)
        VALUES (
          'signature',
          'Новый договор на согласование',
          'От: ' || COALESCE(NEW.sender_name,'организации') || ' — ' || NEW.document_title,
          NEW.id::text
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_title := CASE NEW.status
      WHEN 'signed' THEN 'Документ подписан'
      WHEN 'rejected' THEN 'Документ отклонён'
      WHEN 'changes_requested' THEN 'Запрошены правки по документу'
      WHEN 'viewed' THEN 'Документ просмотрен получателем'
      ELSE NULL
    END;
    IF v_title IS NOT NULL THEN
      v_msg := NEW.document_title || ' — ' || NEW.recipient_name;

      IF NEW.status = 'changes_requested' THEN
        SELECT COUNT(*) INTO v_count
        FROM public.signature_comments sc
        WHERE sc.signature_id = NEW.id
          AND (NEW.current_revision_id IS NULL OR sc.revision_id = NEW.current_revision_id);
        IF v_count IS NOT NULL AND v_count > 0 THEN
          v_title := v_title || ' (' || v_count || ')';
        END IF;
      END IF;

      INSERT INTO public.org_notifications (organization_id, user_id, type, title, message, related_id)
      VALUES (NEW.organization_id, NEW.sender_user_id, 'signature', v_title, v_msg, NEW.id);

      IF NEW.recipient_type = 'admin_sintagma' THEN
        v_admin_title := CASE NEW.status
          WHEN 'signed' THEN 'Договор подписан админом'
          WHEN 'rejected' THEN 'Договор отклонён'
          WHEN 'changes_requested' THEN 'По договору запрошены правки' || CASE WHEN v_count IS NOT NULL AND v_count > 0 THEN ' (' || v_count || ')' ELSE '' END
          WHEN 'viewed' THEN 'Договор просмотрен'
          ELSE NULL
        END;
        IF v_admin_title IS NOT NULL THEN
          INSERT INTO public.admin_notifications (type, title, message, related_entity_id)
          VALUES ('signature', v_admin_title, NEW.document_title || ' — от ' || COALESCE(NEW.sender_name,'организации'), NEW.id::text);
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;