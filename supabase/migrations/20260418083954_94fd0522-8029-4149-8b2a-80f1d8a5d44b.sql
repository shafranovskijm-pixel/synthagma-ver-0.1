
CREATE TABLE IF NOT EXISTS public.kinescope_usage_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  total_bytes bigint NOT NULL DEFAULT 0,
  total_seconds bigint NOT NULL DEFAULT 0,
  videos_count integer NOT NULL DEFAULT 0,
  by_org_json jsonb,
  billing_json jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kinescope_usage_cache_org_uq
  ON public.kinescope_usage_cache(organization_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kinescope_usage_cache_global_uq
  ON public.kinescope_usage_cache((organization_id IS NULL))
  WHERE organization_id IS NULL;

ALTER TABLE public.kinescope_usage_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read kinescope cache" ON public.kinescope_usage_cache;
CREATE POLICY "Admins can read kinescope cache"
  ON public.kinescope_usage_cache
  FOR SELECT
  TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));

DROP POLICY IF EXISTS "Org members can read their kinescope cache" ON public.kinescope_usage_cache;
CREATE POLICY "Org members can read their kinescope cache"
  ON public.kinescope_usage_cache
  FOR SELECT
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_organization_id()
  );
