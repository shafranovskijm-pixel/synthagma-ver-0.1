CREATE OR REPLACE FUNCTION public.pick_next_email_sender()
 RETURNS TABLE(id uuid, email text, app_password text, host text, port integer, encryption text, from_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE picked public.email_sender_pool%ROWTYPE;
BEGIN
  UPDATE public.email_sender_pool p SET sends_today = 0, sends_reset_at = current_date WHERE p.sends_reset_at < current_date;
  SELECT * INTO picked FROM public.email_sender_pool p
    WHERE p.is_active = true AND p.app_password IS NOT NULL AND p.app_password <> '' AND p.sends_today < p.daily_limit
    ORDER BY p.priority ASC, p.last_used_at ASC NULLS FIRST, p.id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF picked.id IS NULL THEN RETURN; END IF;
  UPDATE public.email_sender_pool p
    SET last_used_at = now(), sends_today = sends_today + 1, total_sent = total_sent + 1
    WHERE p.id = picked.id;
  id := picked.id; email := picked.email; app_password := picked.app_password;
  host := picked.host; port := picked.port; encryption := picked.encryption; from_name := picked.from_name;
  RETURN NEXT;
END;
$function$;