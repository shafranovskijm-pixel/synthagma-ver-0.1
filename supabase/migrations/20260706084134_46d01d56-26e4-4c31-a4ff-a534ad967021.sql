-- 1. IMAP-поля в пуле
ALTER TABLE public.email_sender_pool
  ADD COLUMN IF NOT EXISTS imap_host text,
  ADD COLUMN IF NOT EXISTS imap_port integer NOT NULL DEFAULT 993,
  ADD COLUMN IF NOT EXISTS imap_encryption text NOT NULL DEFAULT 'ssl',
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz;

-- 2. История пингов прогрева
CREATE TABLE IF NOT EXISTS public.email_warmup_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warmup_id text NOT NULL UNIQUE,
  sender_id uuid NOT NULL REFERENCES public.email_sender_pool(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.email_sender_pool(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  placement text,                    -- 'inbox' | 'spam' | 'missing' | NULL(не проверено)
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warmup_pings_pending
  ON public.email_warmup_pings (sent_at)
  WHERE placement IS NULL;

GRANT SELECT ON public.email_warmup_pings TO authenticated;
GRANT ALL ON public.email_warmup_pings TO service_role;
ALTER TABLE public.email_warmup_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warmup pings visible to admins"
  ON public.email_warmup_pings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));