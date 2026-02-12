
-- Auto-encrypt passport_data in student_consents table
CREATE OR REPLACE FUNCTION public.trigger_encrypt_consent_passport()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.passport_data IS NOT NULL AND NEW.passport_data != '' AND NOT (NEW.passport_data LIKE 'ENC:%') THEN
    NEW.passport_data = encrypt_password(NEW.passport_data);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER encrypt_consent_passport_trigger
BEFORE INSERT OR UPDATE OF passport_data ON public.student_consents
FOR EACH ROW
EXECUTE FUNCTION public.trigger_encrypt_consent_passport();

-- Encrypt existing plaintext passport_data
UPDATE public.student_consents
SET passport_data = public.encrypt_password(passport_data)
WHERE passport_data IS NOT NULL
  AND passport_data != ''
  AND passport_data NOT LIKE 'ENC:%';

-- RPC to decrypt passport_data for authorized users
CREATE OR REPLACE FUNCTION public.get_decrypted_consent_passport(p_consent_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_encrypted text;
  v_org_id uuid;
BEGIN
  -- Get the consent record
  SELECT passport_data, organization_id INTO v_encrypted, v_org_id
  FROM student_consents WHERE id = p_consent_id;
  
  IF v_encrypted IS NULL THEN RETURN NULL; END IF;
  
  -- Admin can decrypt any
  IF has_role('admin'::app_role, auth.uid()) THEN
    RETURN decrypt_password(v_encrypted);
  END IF;
  
  -- Org user can decrypt for their org
  IF has_role('organization'::app_role, auth.uid()) AND current_organization_id() = v_org_id THEN
    RETURN decrypt_password(v_encrypted);
  END IF;
  
  -- Students can decrypt their own
  IF EXISTS (SELECT 1 FROM student_consents WHERE id = p_consent_id AND user_id = auth.uid()) THEN
    RETURN decrypt_password(v_encrypted);
  END IF;
  
  RETURN NULL;
END;
$function$;

-- Batch decrypt for org view
CREATE OR REPLACE FUNCTION public.get_decrypted_consent_passports(p_consent_ids uuid[])
RETURNS TABLE(consent_id uuid, decrypted_passport text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF has_role('admin'::app_role, auth.uid()) THEN
    RETURN QUERY
    SELECT sc.id, decrypt_password(sc.passport_data)
    FROM student_consents sc
    WHERE sc.id = ANY(p_consent_ids);
    RETURN;
  END IF;
  
  IF has_role('organization'::app_role, auth.uid()) THEN
    RETURN QUERY
    SELECT sc.id, decrypt_password(sc.passport_data)
    FROM student_consents sc
    WHERE sc.id = ANY(p_consent_ids)
      AND sc.organization_id = current_organization_id();
    RETURN;
  END IF;
  
  -- Students: only their own
  RETURN QUERY
  SELECT sc.id, decrypt_password(sc.passport_data)
  FROM student_consents sc
  WHERE sc.id = ANY(p_consent_ids)
    AND sc.user_id = auth.uid();
END;
$function$;
