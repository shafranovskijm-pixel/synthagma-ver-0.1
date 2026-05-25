
-- 1) app_settings: keep public readable for non-sensitive keys; admins read all
DROP POLICY IF EXISTS "Anyone can read app_settings" ON public.app_settings;

CREATE POLICY "Public can read non-sensitive app_settings"
ON public.app_settings
FOR SELECT
USING (
  setting_key NOT IN ('tbank_password','tbank_terminal_key','tbank_secret_key','tbank_test_mode')
);

CREATE POLICY "Admins can read all app_settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()));

-- 2) subscription_invoices: remove overly permissive policy, add proper update/delete
DROP POLICY IF EXISTS "Service role full access" ON public.subscription_invoices;

CREATE POLICY "Org can update own invoices"
ON public.subscription_invoices
FOR UPDATE
TO authenticated
USING (organization_id = public.current_organization_id() OR public.has_role('admin'::app_role, auth.uid()))
WITH CHECK (organization_id = public.current_organization_id() OR public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can delete invoices"
ON public.subscription_invoices
FOR DELETE
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()));

-- 3) organization_offer_acceptances: scope SELECT
DROP POLICY IF EXISTS "Users can view their org acceptances" ON public.organization_offer_acceptances;

CREATE POLICY "Users can view their own or org acceptances"
ON public.organization_offer_acceptances
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR organization_id = public.current_organization_id()
  OR public.has_role('admin'::app_role, auth.uid())
);

-- 4) plan_requests: admin-only SELECT
DROP POLICY IF EXISTS "Admins can view plan requests" ON public.plan_requests;

CREATE POLICY "Admins can view plan requests"
ON public.plan_requests
FOR SELECT
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()));

-- 5) skillspace_import_jobs: remove org-wide visibility of plaintext passwords
DROP POLICY IF EXISTS "Org users can view own import jobs" ON public.skillspace_import_jobs;

-- 6) generation_history: scope by owning organization via courses
DROP POLICY IF EXISTS "Authenticated users can manage generation_history" ON public.generation_history;

CREATE POLICY "Org users can view own generation_history"
ON public.generation_history
FOR SELECT
TO authenticated
USING (
  public.has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = generation_history.course_id
      AND c.organization_id = public.current_organization_id()
  )
);

CREATE POLICY "Org users can insert own generation_history"
ON public.generation_history
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = generation_history.course_id
      AND c.organization_id = public.current_organization_id()
  )
);

CREATE POLICY "Org users can update own generation_history"
ON public.generation_history
FOR UPDATE
TO authenticated
USING (
  public.has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = generation_history.course_id
      AND c.organization_id = public.current_organization_id()
  )
)
WITH CHECK (
  public.has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = generation_history.course_id
      AND c.organization_id = public.current_organization_id()
  )
);

CREATE POLICY "Org users can delete own generation_history"
ON public.generation_history
FOR DELETE
TO authenticated
USING (
  public.has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = generation_history.course_id
      AND c.organization_id = public.current_organization_id()
  )
);

-- 7) Storage: library-files (path: library/{org_id}/...)
DROP POLICY IF EXISTS "Library files are publicly accessible" ON storage.objects;

CREATE POLICY "Org users can read library files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'library-files'
  AND (
    public.has_role('admin'::app_role, auth.uid())
    OR (storage.foldername(name))[2] = public.current_organization_id()::text
  )
);

-- 8) Storage: program-files (path: programs/{org_id}/...)
DROP POLICY IF EXISTS "Public can view program files" ON storage.objects;

CREATE POLICY "Org users can read program files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'program-files'
  AND (
    public.has_role('admin'::app_role, auth.uid())
    OR (storage.foldername(name))[2] = public.current_organization_id()::text
  )
);

-- 9) Storage: frdo-documents (path: {org_id}/...)
DROP POLICY IF EXISTS "Org users can read frdo docs" ON storage.objects;

CREATE POLICY "Org users can read frdo docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'frdo-documents'
  AND (
    public.has_role('admin'::app_role, auth.uid())
    OR (storage.foldername(name))[1] = public.current_organization_id()::text
  )
);
