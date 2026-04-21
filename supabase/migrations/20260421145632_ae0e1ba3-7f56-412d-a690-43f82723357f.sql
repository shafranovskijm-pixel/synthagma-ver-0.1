CREATE TABLE IF NOT EXISTS public.sales_companies_db (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inn text UNIQUE NOT NULL,
  ogrn text,
  name text NOT NULL,
  short_name text,
  full_name text,
  address text,
  city text,
  region text,
  phone text,
  email text,
  website text,
  director text,
  director_position text,
  okved_main text,
  okved_list text[],
  license_number text,
  license_issue_date text,
  license_authority text,
  license_activities text[],
  license_valid_to text,
  has_education_license boolean DEFAULT false,
  status text,
  employee_count int,
  source_url text,
  raw_data jsonb,
  parsed_at timestamptz DEFAULT now(),
  converted_to_lead_id uuid REFERENCES public.sales_leads(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_companies_db_inn ON public.sales_companies_db(inn);
CREATE INDEX IF NOT EXISTS idx_sales_companies_db_city ON public.sales_companies_db(city);
CREATE INDEX IF NOT EXISTS idx_sales_companies_db_has_license ON public.sales_companies_db(has_education_license);
CREATE INDEX IF NOT EXISTS idx_sales_companies_db_parsed_at ON public.sales_companies_db(parsed_at DESC);

ALTER TABLE public.sales_companies_db ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all sales companies db"
ON public.sales_companies_db FOR SELECT
USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can insert sales companies db"
ON public.sales_companies_db FOR INSERT
WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can update sales companies db"
ON public.sales_companies_db FOR UPDATE
USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can delete sales companies db"
ON public.sales_companies_db FOR DELETE
USING (public.has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER trg_sales_companies_db_updated_at
BEFORE UPDATE ON public.sales_companies_db
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();