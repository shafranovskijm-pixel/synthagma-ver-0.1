
CREATE TABLE public.email_sender_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  app_password text,
  host text NOT NULL DEFAULT 'smtp.gmail.com',
  port int NOT NULL DEFAULT 465,
  encryption text NOT NULL DEFAULT 'ssl',
  from_name text,
  is_active boolean NOT NULL DEFAULT false,
  priority int NOT NULL DEFAULT 100,
  daily_limit int NOT NULL DEFAULT 400,
  sends_today int NOT NULL DEFAULT 0,
  sends_reset_at date NOT NULL DEFAULT current_date,
  last_used_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sender_pool TO authenticated;
GRANT ALL ON public.email_sender_pool TO service_role;

ALTER TABLE public.email_sender_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sender pool"
  ON public.email_sender_pool FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_email_sender_pool_updated_at
  BEFORE UPDATE ON public.email_sender_pool
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Round-robin picker: returns least-recently-used active sender under daily limit.
-- SECURITY DEFINER so edge functions (service_role) and admin UI can call it.
CREATE OR REPLACE FUNCTION public.pick_next_email_sender()
RETURNS TABLE(
  id uuid,
  email text,
  app_password text,
  host text,
  port int,
  encryption text,
  from_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  picked public.email_sender_pool%ROWTYPE;
BEGIN
  -- Reset daily counters lazily
  UPDATE public.email_sender_pool
    SET sends_today = 0, sends_reset_at = current_date
    WHERE sends_reset_at < current_date;

  SELECT * INTO picked
    FROM public.email_sender_pool
    WHERE is_active = true
      AND app_password IS NOT NULL
      AND app_password <> ''
      AND sends_today < daily_limit
    ORDER BY priority ASC, last_used_at ASC NULLS FIRST, id
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF picked.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.email_sender_pool
    SET last_used_at = now(),
        sends_today = sends_today + 1
    WHERE public.email_sender_pool.id = picked.id;

  id := picked.id;
  email := picked.email;
  app_password := picked.app_password;
  host := picked.host;
  port := picked.port;
  encryption := picked.encryption;
  from_name := picked.from_name;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_next_email_sender() FROM public;
GRANT EXECUTE ON FUNCTION public.pick_next_email_sender() TO service_role;

-- Mark send result (used by edge functions to record failures)
CREATE OR REPLACE FUNCTION public.mark_email_sender_result(_sender_id uuid, _error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _error IS NULL THEN
    UPDATE public.email_sender_pool
      SET last_error = NULL, last_error_at = NULL
      WHERE id = _sender_id;
  ELSE
    UPDATE public.email_sender_pool
      SET last_error = _error, last_error_at = now()
      WHERE id = _sender_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_email_sender_result(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_email_sender_result(uuid, text) TO service_role;
