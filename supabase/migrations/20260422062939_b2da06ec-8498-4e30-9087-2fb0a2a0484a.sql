
DROP POLICY IF EXISTS "Anon can vote in public polls" ON public.webinar_poll_votes;
CREATE POLICY "Anon can vote in public polls"
ON public.webinar_poll_votes
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.webinar_polls p
    JOIN public.webinars w ON w.id = p.webinar_id
    WHERE p.id = webinar_poll_votes.poll_id
      AND p.status = 'active'
      AND w.allow_guests = true
      AND w.status = 'live'
  )
);

DROP POLICY IF EXISTS "Auth can vote in accessible polls" ON public.webinar_poll_votes;
CREATE POLICY "Auth can vote in accessible polls"
ON public.webinar_poll_votes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.webinar_polls p
    JOIN public.webinars w ON w.id = p.webinar_id
    WHERE p.id = webinar_poll_votes.poll_id
      AND p.status = 'active'
      AND (
        has_role('admin'::app_role, auth.uid())
        OR w.organization_id = current_organization_id()
        OR EXISTS (SELECT 1 FROM public.webinar_participants wp WHERE wp.webinar_id = w.id AND wp.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = w.course_id AND e.user_id = auth.uid())
      )
  )
);
