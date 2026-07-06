
CREATE TABLE IF NOT EXISTS public.broadcast_companies_db (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  company_name TEXT,
  first_name TEXT,
  last_name TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  last_sent_at TIMESTAMPTZ,
  last_campaign_id UUID,
  source TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcast_companies_db_last_sent_idx ON public.broadcast_companies_db(last_sent_at DESC);
CREATE INDEX IF NOT EXISTS broadcast_companies_db_company_idx ON public.broadcast_companies_db(company_name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_companies_db TO authenticated;
GRANT ALL ON public.broadcast_companies_db TO service_role;

ALTER TABLE public.broadcast_companies_db ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage broadcast companies db"
  ON public.broadcast_companies_db FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_broadcast_companies_db_updated_at
  BEFORE UPDATE ON public.broadcast_companies_db
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
