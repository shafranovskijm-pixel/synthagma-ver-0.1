
-- Drop old RPC first (return type changed)
DROP FUNCTION IF EXISTS public.get_decrypted_payment_settings(uuid);

-- Update RPC to return T-Bank fields
CREATE OR REPLACE FUNCTION public.get_decrypted_payment_settings(p_organization_id uuid)
 RETURNS TABLE(terminal_key text, password text, is_test_mode boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT ops.terminal_key,
    decrypt_password(ops.password_encrypted) as password,
    ops.is_test_mode
  FROM organization_payment_settings ops
  WHERE ops.organization_id = p_organization_id;
END;
$function$;
