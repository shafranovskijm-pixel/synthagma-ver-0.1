
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'novofon',
  ADD COLUMN IF NOT EXISTS novofon_call_id text,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS cost_rub numeric(10,2);

CREATE INDEX IF NOT EXISTS idx_call_logs_novofon_id
  ON public.call_logs (novofon_call_id)
  WHERE novofon_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_lead
  ON public.call_logs (lead_id, started_at DESC)
  WHERE lead_id IS NOT NULL;
