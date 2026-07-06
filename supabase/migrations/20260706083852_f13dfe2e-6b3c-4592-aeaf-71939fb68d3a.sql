ALTER TABLE public.email_sender_pool
  ADD COLUMN IF NOT EXISTS warmup_inbox_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_spam_count integer NOT NULL DEFAULT 0;