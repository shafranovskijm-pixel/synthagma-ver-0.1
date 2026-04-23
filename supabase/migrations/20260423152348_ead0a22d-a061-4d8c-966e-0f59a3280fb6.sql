ALTER TABLE public.checko_api_usage
  ADD COLUMN IF NOT EXISTS search_requests_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.checko_search_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  regions integer[] NOT NULL DEFAULT '{}',
  licenses text[] NOT NULL DEFAULT '{}',
  okveds text[] NOT NULL DEFAULT '{}',
  active_only boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checko_search_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all checko presets"
  ON public.checko_search_presets
  FOR ALL
  TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE TABLE IF NOT EXISTS public.checko_search_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NULL REFERENCES public.checko_search_presets(id) ON DELETE SET NULL,
  regions integer[] NOT NULL DEFAULT '{}',
  licenses text[] NOT NULL DEFAULT '{}',
  okveds text[] NOT NULL DEFAULT '{}',
  active_only boolean NOT NULL DEFAULT true,
  found_count integer NOT NULL DEFAULT 0,
  enriched_count integer NOT NULL DEFAULT 0,
  queued_count integer NOT NULL DEFAULT 0,
  search_requests_used integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  error_message text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checko_search_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all checko runs"
  ON public.checko_search_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins insert checko runs"
  ON public.checko_search_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_checko_search_runs_created_at
  ON public.checko_search_runs(created_at DESC);

DROP TRIGGER IF EXISTS update_checko_search_presets_updated_at ON public.checko_search_presets;
CREATE TRIGGER update_checko_search_presets_updated_at
  BEFORE UPDATE ON public.checko_search_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();