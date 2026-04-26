ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_archived_at ON public.profiles (organization_id, archived_at);