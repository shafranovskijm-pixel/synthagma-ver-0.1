
-- Admin-only RPC to decrypt all student passwords (requires admin role)
CREATE OR REPLACE FUNCTION get_all_decrypted_passwords()
RETURNS TABLE(user_id uuid, decrypted_password text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can call this
  IF NOT has_role('admin'::app_role, auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT p.user_id,
    CASE
      WHEN p.generated_password IS NOT NULL AND p.generated_password LIKE 'ENC:%' THEN
        pgp_sym_decrypt(
          decode(substring(p.generated_password from 5), 'base64'),
          current_setting('app.encryption_key', true)
        )
      ELSE p.generated_password
    END AS decrypted_password
  FROM profiles p
  WHERE p.generated_password IS NOT NULL;
END;
$$;
