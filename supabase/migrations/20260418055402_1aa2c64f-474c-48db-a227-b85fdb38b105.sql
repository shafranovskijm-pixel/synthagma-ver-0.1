
-- 1) Расширяем CHECK на document_type
ALTER TABLE public.document_signatures DROP CONSTRAINT IF EXISTS document_signatures_document_type_check;
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_document_type_check
  CHECK (document_type = ANY (ARRAY['contract','consent','pep_agreement','act','order','custom_pdf','education_document','external_upload']));

-- 2) Расширяем CHECK на status (добавляем in_review, changes_requested)
ALTER TABLE public.document_signatures DROP CONSTRAINT IF EXISTS document_signatures_status_check;
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_status_check
  CHECK (status = ANY (ARRAY['draft','sent','viewed','signed','rejected','expired','in_review','changes_requested']));

-- 3) Расширяем recipient_type (для будущей админ-Синтагмы)
ALTER TABLE public.document_signatures DROP CONSTRAINT IF EXISTS document_signatures_recipient_type_check;
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_recipient_type_check
  CHECK (recipient_type = ANY (ARRAY['student','company','individual','admin_sintagma']));

-- 4) Триггер: уведомления при отправке/смене статуса
CREATE OR REPLACE FUNCTION public.notify_on_signature_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title text;
  v_msg text;
BEGIN
  -- INSERT: документ создан и отправлен
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('sent','in_review') THEN
      -- Уведомление отправителю-организации (для трекинга)
      INSERT INTO public.org_notifications (organization_id, user_id, type, title, message, related_id)
      VALUES (
        NEW.organization_id,
        NEW.sender_user_id,
        'signature',
        CASE WHEN NEW.status='in_review' THEN 'Документ отправлен на согласование' ELSE 'Документ отправлен на подписание' END,
        'Получатель: ' || NEW.recipient_name || ' (' || NEW.recipient_email || ') — ' || NEW.document_title,
        NEW.id
      );
      -- Уведомление получателю, если он внутренний пользователь
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
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: смена статуса
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
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_signature_event ON public.document_signatures;
CREATE TRIGGER trg_notify_on_signature_event
AFTER INSERT OR UPDATE ON public.document_signatures
FOR EACH ROW EXECUTE FUNCTION public.notify_on_signature_event();
