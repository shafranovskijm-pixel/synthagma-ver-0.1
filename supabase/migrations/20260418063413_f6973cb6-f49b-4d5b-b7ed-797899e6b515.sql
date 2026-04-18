
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
      INSERT INTO public.org_notifications (organization_id, user_id, type, title, message, related_id)
      VALUES (NEW.organization_id, NEW.sender_user_id, 'signature', v_title, v_msg, NEW.id);

      IF NEW.recipient_type = 'admin_sintagma' THEN
        v_admin_title := CASE NEW.status
          WHEN 'signed' THEN 'Договор подписан админом'
          WHEN 'rejected' THEN 'Договор отклонён'
          WHEN 'changes_requested' THEN 'По договору запрошены правки'
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

INSERT INTO public.admin_notifications (type, title, message, related_entity_id, created_at)
SELECT 'signature',
       'Новый договор на согласование',
       'От: ' || COALESCE(ds.sender_name,'организации') || ' — ' || ds.document_title,
       ds.id::text,
       ds.created_at
FROM public.document_signatures ds
WHERE ds.recipient_type = 'admin_sintagma'
  AND ds.status IN ('sent','in_review')
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_notifications an
    WHERE an.related_entity_id = ds.id::text AND an.type = 'signature'
  );
