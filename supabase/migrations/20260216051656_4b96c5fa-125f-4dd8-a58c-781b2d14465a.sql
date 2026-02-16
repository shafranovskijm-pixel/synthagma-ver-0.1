
CREATE OR REPLACE FUNCTION public.get_all_decrypted_passwords()
 RETURNS TABLE(user_id uuid, decrypted_password text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only admins can call this
  IF NOT has_role('admin'::app_role, auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT p.user_id, decrypt_password(p.generated_password) AS decrypted_password
  FROM profiles p
  WHERE p.generated_password IS NOT NULL AND p.generated_password != '';
END;
$function$;
