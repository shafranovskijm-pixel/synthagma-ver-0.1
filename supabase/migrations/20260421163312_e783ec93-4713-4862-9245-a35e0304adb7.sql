-- 1. Расширяем sales_companies_db
ALTER TABLE public.sales_companies_db
  ADD COLUMN IF NOT EXISTS kpp text,
  ADD COLUMN IF NOT EXISTS okpo text,
  ADD COLUMN IF NOT EXISTS registration_date date,
  ADD COLUMN IF NOT EXISTS phones text[],
  ADD COLUMN IF NOT EXISTS emails text[],
  ADD COLUMN IF NOT EXISTS social_links jsonb,
  ADD COLUMN IF NOT EXISTS director_inn text,
  ADD COLUMN IF NOT EXISTS licenses jsonb,
  ADD COLUMN IF NOT EXISTS okved_list jsonb,
  ADD COLUMN IF NOT EXISTS employee_count integer,
  ADD COLUMN IF NOT EXISTS charter_capital numeric,
  ADD COLUMN IF NOT EXISTS unfair_supplier boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mass_director boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mass_address boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sanctions boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS successors jsonb,
  ADD COLUMN IF NOT EXISTS predecessors jsonb,
  ADD COLUMN IF NOT EXISTS branches_count integer,
  ADD COLUMN IF NOT EXISTS last_data_date date,
  ADD COLUMN IF NOT EXISTS raw_data jsonb,
  ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'list-org';

CREATE UNIQUE INDEX IF NOT EXISTS sales_companies_db_inn_key ON public.sales_companies_db (inn);

-- 2. Учёт квоты
CREATE TABLE IF NOT EXISTS public.checko_api_usage (
  date date PRIMARY KEY,
  requests_count integer NOT NULL DEFAULT 0,
  last_balance numeric,
  last_used_at timestamptz
);
ALTER TABLE public.checko_api_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read checko usage" ON public.checko_api_usage;
CREATE POLICY "Admins read checko usage" ON public.checko_api_usage
  FOR SELECT TO authenticated USING (has_role('admin'::app_role, auth.uid()));

-- 3. Настройки
CREATE TABLE IF NOT EXISTS public.checko_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_enrich_enabled boolean NOT NULL DEFAULT false,
  last_auto_run_at timestamptz,
  last_auto_processed integer,
  last_auto_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.checko_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.checko_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage checko settings" ON public.checko_settings;
CREATE POLICY "Admins manage checko settings" ON public.checko_settings
  FOR ALL TO authenticated
  USING (has_role('admin'::app_role, auth.uid()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

-- 4. Очередь
CREATE TABLE IF NOT EXISTS public.checko_pending_inns (
  inn text PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now(),
  note text
);
ALTER TABLE public.checko_pending_inns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage checko queue" ON public.checko_pending_inns;
CREATE POLICY "Admins manage checko queue" ON public.checko_pending_inns
  FOR ALL TO authenticated
  USING (has_role('admin'::app_role, auth.uid()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()));