ALTER TABLE public.email_sender_pool
  ADD COLUMN IF NOT EXISTS warmup_daily_target integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS warmup_start_count integer NOT NULL DEFAULT 1;