-- Tighten overly-permissive RLS policies flagged by the linter

-- organizations: require authenticated user to create org (instead of WITH CHECK (true))
DROP POLICY IF EXISTS public_insert_organizations ON public.organizations;
CREATE POLICY public_insert_organizations
ON public.organizations
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- enrollment_history: only backend/service role can insert system history
DROP POLICY IF EXISTS "System can insert enrollment history" ON public.enrollment_history;
CREATE POLICY "System can insert enrollment history"
ON public.enrollment_history
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- org_notifications: only backend/service role can insert notifications
DROP POLICY IF EXISTS "System can insert notifications" ON public.org_notifications;
CREATE POLICY "System can insert notifications"
ON public.org_notifications
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- newsletter_subscribers: allow public subscribe but require a non-empty email
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.newsletter_subscribers;
CREATE POLICY "Anyone can subscribe"
ON public.newsletter_subscribers
FOR INSERT
WITH CHECK (email IS NOT NULL AND length(trim(email)) >= 5);

-- newsletter_subscribers: restrict admin management to admins (instead of USING (true))
DROP POLICY IF EXISTS "Admins can manage subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Admins can manage subscribers"
ON public.newsletter_subscribers
FOR ALL
USING (has_role('admin'::app_role, auth.uid()))
WITH CHECK (has_role('admin'::app_role, auth.uid()));
