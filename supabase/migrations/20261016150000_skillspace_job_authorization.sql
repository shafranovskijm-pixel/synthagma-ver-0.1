-- Import is an administrator workflow. A creator ID supplied through the old
-- organization INSERT policy is not evidence that an admin authorized a job.
BEGIN;
DO $preflight$
DECLARE unexpected text;
BEGIN
  SELECT string_agg(policyname,', ' ORDER BY policyname) INTO unexpected FROM pg_policies
   WHERE schemaname='public' AND tablename='skillspace_import_jobs' AND permissive='PERMISSIVE'
     AND policyname NOT IN('Admins can view all import jobs','Admins can insert import jobs','Org users can insert own import jobs');
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'skillspace_job_authorization: unexpected permissive policies: %',unexpected;
  END IF;
  -- The previous security release removed organization reads of credential
  -- columns. Do not accidentally restore or silently reinterpret that scope.
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='skillspace_import_jobs'
      AND permissive='PERMISSIVE' AND cmd IN('SELECT','ALL')) <> 1
     OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skillspace_import_jobs'
       AND policyname='Admins can view all import jobs' AND cmd='SELECT' AND permissive='PERMISSIVE'
       AND roles=ARRAY['authenticated']::name[] AND qual IN(
         $expr$has_role('admin'::app_role, auth.uid())$expr$,
         $expr$public.has_role('admin'::app_role, auth.uid())$expr$)) THEN
    RAISE EXCEPTION 'skillspace_job_authorization: admin-only SELECT policy requires review';
  END IF;
END $preflight$;

-- No backfill: old jobs must be explicitly reconciled before a worker can
-- trust their recorded creator. The marker contains no credentials.
ALTER TABLE public.skillspace_import_jobs ADD COLUMN authorization_verified_at timestamptz;

CREATE FUNCTION public.verify_skillspace_job_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE active_creator boolean;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.id,NEW.organization_id,NEW.batch_id,NEW.created_by) IS DISTINCT FROM
       (OLD.id,OLD.organization_id,OLD.batch_id,OLD.created_by) THEN
      RAISE EXCEPTION 'Import job identity is immutable' USING ERRCODE='42501';
    END IF;
    IF NEW.authorization_verified_at IS NOT DISTINCT FROM OLD.authorization_verified_at THEN RETURN NEW; END IF;
    -- A deliberate service-side reconciliation may authorize an old job only
    -- once. Ordinary status updates never turn an unverified old job trusted.
    IF auth.role() IS DISTINCT FROM 'service_role' OR OLD.authorization_verified_at IS NOT NULL
       OR NEW.authorization_verified_at IS NULL THEN
      RAISE EXCEPTION 'Trusted import reconciliation required' USING ERRCODE='42501';
    END IF;
  ELSIF auth.role() IS DISTINCT FROM 'service_role' AND (
      auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid()
      OR NOT public.has_role('admin'::public.app_role,auth.uid())) THEN
    RAISE EXCEPTION 'Platform administrator must authorize import' USING ERRCODE='42501';
  END IF;
  active_creator:=NEW.created_by IS NOT NULL
    AND public.has_role('admin'::public.app_role,NEW.created_by)
    AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=NEW.created_by);
  IF NOT active_creator THEN
    RAISE EXCEPTION 'Active administrator creator required' USING ERRCODE='42501';
  END IF;
  NEW.authorization_verified_at:=now();
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.verify_skillspace_job_authorization() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER verify_skillspace_job_authorization
BEFORE INSERT OR UPDATE ON public.skillspace_import_jobs
FOR EACH ROW EXECUTE FUNCTION public.verify_skillspace_job_authorization();

DROP POLICY "Org users can insert own import jobs" ON public.skillspace_import_jobs;
DROP POLICY "Admins can insert import jobs" ON public.skillspace_import_jobs;
CREATE POLICY "Admins can insert import jobs" ON public.skillspace_import_jobs
FOR INSERT TO authenticated WITH CHECK(
  public.has_role('admin'::public.app_role,auth.uid())
  AND public.account_deletion_access_allowed() AND created_by=auth.uid());
-- No browser UPDATE/DELETE grant is introduced. Existing SELECT, encryption,
-- account deletion, realtime and service worker status/result writes remain.
NOTIFY pgrst,'reload schema';
COMMIT;
