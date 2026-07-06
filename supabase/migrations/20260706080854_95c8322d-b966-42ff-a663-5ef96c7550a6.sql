ALTER TABLE public.email_sender_pool
  ADD COLUMN IF NOT EXISTS total_sent int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.pick_next_email_sender()
RETURNS TABLE(
  id uuid, email text, app_password text, host text, port int, encryption text, from_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE picked public.email_sender_pool%ROWTYPE;
BEGIN
  UPDATE public.email_sender_pool SET sends_today = 0, sends_reset_at = current_date WHERE sends_reset_at < current_date;
  SELECT * INTO picked FROM public.email_sender_pool
    WHERE is_active = true AND app_password IS NOT NULL AND app_password <> '' AND sends_today < daily_limit
    ORDER BY priority ASC, last_used_at ASC NULLS FIRST, id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF picked.id IS NULL THEN RETURN; END IF;
  UPDATE public.email_sender_pool
    SET last_used_at = now(), sends_today = sends_today + 1, total_sent = total_sent + 1
    WHERE public.email_sender_pool.id = picked.id;
  id := picked.id; email := picked.email; app_password := picked.app_password;
  host := picked.host; port := picked.port; encryption := picked.encryption; from_name := picked.from_name;
  RETURN NEXT;
END;
$$;