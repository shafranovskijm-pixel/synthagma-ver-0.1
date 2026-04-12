
-- Create skillspace_import_jobs table
CREATE TABLE public.skillspace_import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  login TEXT NOT NULL,
  password TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.skillspace_import_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can view all import jobs"
ON public.skillspace_import_jobs FOR SELECT
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can view own import jobs"
ON public.skillspace_import_jobs FOR SELECT
TO authenticated
USING (organization_id = public.current_organization_id());

CREATE POLICY "Admins can insert import jobs"
ON public.skillspace_import_jobs FOR INSERT
TO authenticated
WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can insert own import jobs"
ON public.skillspace_import_jobs FOR INSERT
TO authenticated
WITH CHECK (organization_id = public.current_organization_id());

-- Updated_at trigger
CREATE TRIGGER update_skillspace_import_jobs_updated_at
BEFORE UPDATE ON public.skillspace_import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Encrypt login/password on insert/update
CREATE OR REPLACE FUNCTION public.trigger_encrypt_import_job_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NEW.login IS NOT NULL AND NEW.login != '' AND NOT (NEW.login LIKE 'ENC:%') THEN
    NEW.login = encrypt_password(NEW.login);
  END IF;
  IF NEW.password IS NOT NULL AND NEW.password != '' AND NOT (NEW.password LIKE 'ENC:%') THEN
    NEW.password = encrypt_password(NEW.password);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER encrypt_import_job_credentials
BEFORE INSERT OR UPDATE ON public.skillspace_import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.trigger_encrypt_import_job_credentials();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.skillspace_import_jobs;

-- Index for polling by batch_id
CREATE INDEX idx_skillspace_import_jobs_batch ON public.skillspace_import_jobs(batch_id);
CREATE INDEX idx_skillspace_import_jobs_org_status ON public.skillspace_import_jobs(organization_id, status);
