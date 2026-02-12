
-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Store encryption key in Supabase Vault
SELECT vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'password_encryption_key',
  'Encryption key for password fields at rest'
);

-- Internal helper to retrieve encryption key
CREATE OR REPLACE FUNCTION _get_pw_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets 
  WHERE name = 'password_encryption_key' LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION _get_pw_key() FROM public, anon, authenticated;

-- Encrypt function
CREATE OR REPLACE FUNCTION encrypt_password(p_text text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_text IS NULL OR p_text = '' THEN RETURN p_text; END IF;
  IF p_text LIKE 'ENC:%' THEN RETURN p_text; END IF;
  RETURN 'ENC:' || encode(pgp_sym_encrypt(p_text, _get_pw_key()), 'base64');
END;
$$;

REVOKE EXECUTE ON FUNCTION encrypt_password(text) FROM public, anon, authenticated;

-- Decrypt function
CREATE OR REPLACE FUNCTION decrypt_password(p_text text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_text IS NULL OR p_text = '' THEN RETURN p_text; END IF;
  IF NOT (p_text LIKE 'ENC:%') THEN RETURN p_text; END IF;
  RETURN pgp_sym_decrypt(decode(substring(p_text from 5), 'base64'), _get_pw_key());
END;
$$;

REVOKE EXECUTE ON FUNCTION decrypt_password(text) FROM public, anon, authenticated;

-- ===== AUTO-ENCRYPT TRIGGERS =====

CREATE OR REPLACE FUNCTION trigger_encrypt_profile_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.generated_password IS NOT NULL AND NEW.generated_password != '' AND NOT (NEW.generated_password LIKE 'ENC:%') THEN
    NEW.generated_password = encrypt_password(NEW.generated_password);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER encrypt_profile_password
BEFORE INSERT OR UPDATE OF generated_password ON profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_encrypt_profile_password();

CREATE OR REPLACE FUNCTION trigger_encrypt_org_cred_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.login_password IS NOT NULL AND NEW.login_password != '' AND NOT (NEW.login_password LIKE 'ENC:%') THEN
    NEW.login_password = encrypt_password(NEW.login_password);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER encrypt_org_cred_password
BEFORE INSERT OR UPDATE OF login_password ON organization_credentials
FOR EACH ROW
EXECUTE FUNCTION trigger_encrypt_org_cred_password();

CREATE OR REPLACE FUNCTION trigger_encrypt_labor_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.generated_password IS NOT NULL AND NEW.generated_password != '' AND NOT (NEW.generated_password LIKE 'ENC:%') THEN
    NEW.generated_password = encrypt_password(NEW.generated_password);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER encrypt_labor_password
BEFORE INSERT OR UPDATE OF generated_password ON labor_safety_profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_encrypt_labor_password();

-- ===== ENCRYPT EXISTING DATA =====

UPDATE profiles 
SET generated_password = encrypt_password(generated_password) 
WHERE generated_password IS NOT NULL 
  AND generated_password != '' 
  AND NOT (generated_password LIKE 'ENC:%');

UPDATE organization_credentials 
SET login_password = encrypt_password(login_password) 
WHERE login_password IS NOT NULL 
  AND login_password != '' 
  AND NOT (login_password LIKE 'ENC:%');

UPDATE labor_safety_profiles 
SET generated_password = encrypt_password(generated_password) 
WHERE generated_password IS NOT NULL 
  AND generated_password != '' 
  AND NOT (generated_password LIKE 'ENC:%');

-- ===== RPC FUNCTIONS FOR DECRYPTED ACCESS =====

CREATE OR REPLACE FUNCTION get_decrypted_student_password(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encrypted text;
BEGIN
  IF has_role('admin'::app_role, auth.uid()) THEN
    SELECT generated_password INTO v_encrypted FROM profiles WHERE user_id = p_user_id;
    RETURN decrypt_password(v_encrypted);
  END IF;
  
  IF has_role('organization'::app_role, auth.uid()) THEN
    SELECT p.generated_password INTO v_encrypted 
    FROM profiles p
    WHERE p.user_id = p_user_id 
      AND p.organization_id = current_organization_id();
    RETURN decrypt_password(v_encrypted);
  END IF;
  
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION get_decrypted_org_credentials(p_organization_id uuid)
RETURNS TABLE(login_email text, login_password text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role('admin'::app_role, auth.uid()) THEN
    RETURN QUERY 
    SELECT oc.login_email, decrypt_password(oc.login_password) as login_password
    FROM organization_credentials oc
    WHERE oc.organization_id = p_organization_id;
    RETURN;
  END IF;
  
  IF has_role('organization'::app_role, auth.uid()) AND current_organization_id() = p_organization_id THEN
    RETURN QUERY 
    SELECT oc.login_email, decrypt_password(oc.login_password) as login_password
    FROM organization_credentials oc
    WHERE oc.organization_id = p_organization_id;
    RETURN;
  END IF;
  
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION get_decrypted_labor_password(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encrypted text;
BEGIN
  IF has_role('admin'::app_role, auth.uid()) THEN
    SELECT generated_password INTO v_encrypted FROM labor_safety_profiles WHERE user_id = p_user_id;
    RETURN decrypt_password(v_encrypted);
  END IF;
  
  IF has_role('organization'::app_role, auth.uid()) THEN
    SELECT lsp.generated_password INTO v_encrypted 
    FROM labor_safety_profiles lsp
    WHERE lsp.user_id = p_user_id 
      AND lsp.organization_id = current_organization_id();
    RETURN decrypt_password(v_encrypted);
  END IF;
  
  RETURN NULL;
END;
$$;

-- Bulk decrypt for org dashboard (returns all student passwords for an org)
CREATE OR REPLACE FUNCTION get_decrypted_student_passwords(p_organization_id uuid)
RETURNS TABLE(user_id uuid, decrypted_password text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role('admin'::app_role, auth.uid()) THEN
    RETURN QUERY 
    SELECT p.user_id, decrypt_password(p.generated_password) as decrypted_password
    FROM profiles p
    WHERE p.organization_id = p_organization_id
      AND p.generated_password IS NOT NULL
      AND p.generated_password != '';
    RETURN;
  END IF;
  
  IF has_role('organization'::app_role, auth.uid()) AND current_organization_id() = p_organization_id THEN
    RETURN QUERY 
    SELECT p.user_id, decrypt_password(p.generated_password) as decrypted_password
    FROM profiles p
    WHERE p.organization_id = p_organization_id
      AND p.generated_password IS NOT NULL
      AND p.generated_password != '';
    RETURN;
  END IF;
  
  RETURN;
END;
$$;
