
ALTER TABLE public.sales_managers
  ADD COLUMN IF NOT EXISTS script_overrides jsonb,
  ADD COLUMN IF NOT EXISTS email_sender_mode text NOT NULL DEFAULT 'pool';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_managers_email_sender_mode_check'
  ) THEN
    ALTER TABLE public.sales_managers
      ADD CONSTRAINT sales_managers_email_sender_mode_check
      CHECK (email_sender_mode IN ('pool','personal'));
  END IF;
END $$;

ALTER TABLE public.email_sender_pool
  ADD COLUMN IF NOT EXISTS assigned_manager_id uuid REFERENCES public.sales_managers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS email_sender_pool_assigned_manager_idx
  ON public.email_sender_pool(assigned_manager_id);

-- Overloaded picker: honours manager mode.
CREATE OR REPLACE FUNCTION public.pick_next_email_sender(p_manager_id uuid)
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
  v_mode text;
BEGIN
  UPDATE public.email_sender_pool
    SET sends_today = 0, sends_reset_at = current_date
    WHERE sends_reset_at < current_date;

  SELECT email_sender_mode INTO v_mode
    FROM public.sales_managers WHERE id = p_manager_id;

  IF v_mode = 'personal' THEN
    SELECT * INTO picked
      FROM public.email_sender_pool
      WHERE is_active = true
        AND app_password IS NOT NULL AND app_password <> ''
        AND sends_today < daily_limit
        AND assigned_manager_id = p_manager_id
      ORDER BY priority ASC, last_used_at ASC NULLS FIRST, id
      LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;

  IF picked.id IS NULL THEN
    SELECT * INTO picked
      FROM public.email_sender_pool
      WHERE is_active = true
        AND app_password IS NOT NULL AND app_password <> ''
        AND sends_today < daily_limit
        AND (assigned_manager_id IS NULL OR v_mode IS DISTINCT FROM 'personal')
      ORDER BY priority ASC, last_used_at ASC NULLS FIRST, id
      LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;

  IF picked.id IS NULL THEN RETURN; END IF;

  UPDATE public.email_sender_pool
    SET last_used_at = now(), sends_today = sends_today + 1
    WHERE public.email_sender_pool.id = picked.id;

  id := picked.id; email := picked.email; app_password := picked.app_password;
  host := picked.host; port := picked.port; encryption := picked.encryption;
  from_name := picked.from_name;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_next_email_sender(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pick_next_email_sender(uuid) TO service_role;
