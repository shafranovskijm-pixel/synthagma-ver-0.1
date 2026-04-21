
DROP POLICY IF EXISTS "Anyone can submit plan request" ON public.plan_requests;
CREATE POLICY "Public can submit plan request with valid data"
ON public.plan_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  full_name IS NOT NULL AND length(trim(full_name)) BETWEEN 2 AND 200
  AND email IS NOT NULL AND length(trim(email)) BETWEEN 5 AND 200 AND email LIKE '%@%'
  AND phone IS NOT NULL AND length(trim(phone)) BETWEEN 5 AND 50
  AND plan IS NOT NULL AND length(trim(plan)) BETWEEN 1 AND 50
);

DROP POLICY IF EXISTS "Anyone can insert demo sessions" ON public.sales_demo_sessions;
CREATE POLICY "Public can submit demo sessions with valid link"
ON public.sales_demo_sessions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  demo_link_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.sales_demo_links WHERE id = demo_link_id)
);

DROP POLICY IF EXISTS "Service role can insert admin notifications" ON public.admin_notifications;
