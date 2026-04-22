
-- Переписываем permissive политики

-- CHAT INSERT
DROP POLICY IF EXISTS "Authenticated can insert own chat" ON public.webinar_chat_messages;
CREATE POLICY "Auth users can chat in accessible webinars"
ON public.webinar_chat_messages FOR INSERT TO authenticated
WITH CHECK (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.organization_id = current_organization_id())
  OR EXISTS (SELECT 1 FROM webinar_participants wp WHERE wp.webinar_id = webinar_chat_messages.webinar_id AND wp.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM webinars w
    JOIN enrollments e ON e.course_id = w.course_id
    WHERE w.id = webinar_chat_messages.webinar_id AND e.user_id = auth.uid()
  )
);

-- CHAT INSERT for anon (guests in public webinars)
CREATE POLICY "Guests can chat in public webinars"
ON public.webinar_chat_messages FOR INSERT TO anon
WITH CHECK (
  EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.allow_guests = true)
);

-- QUESTIONS INSERT (auth)
DROP POLICY IF EXISTS "Auth can ask questions" ON public.webinar_questions;
CREATE POLICY "Auth can ask in accessible webinars"
ON public.webinar_questions FOR INSERT TO authenticated
WITH CHECK (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (SELECT 1 FROM webinars w WHERE w.id = webinar_id AND w.organization_id = current_organization_id())
  OR EXISTS (SELECT 1 FROM webinar_participants wp WHERE wp.webinar_id = webinar_questions.webinar_id AND wp.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM webinars w
    JOIN enrollments e ON e.course_id = w.course_id
    WHERE w.id = webinar_questions.webinar_id AND e.user_id = auth.uid()
  )
);

-- POLL VOTES — auth users vote only if they have access
DROP POLICY IF EXISTS "Auth can vote" ON public.webinar_poll_votes;
CREATE POLICY "Auth can vote in accessible polls"
ON public.webinar_poll_votes FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM webinar_polls p
    JOIN webinars w ON w.id = p.webinar_id
    WHERE p.id = webinar_poll_votes.poll_id
      AND (
        has_role('admin'::app_role, auth.uid())
        OR w.organization_id = current_organization_id()
        OR EXISTS (SELECT 1 FROM webinar_participants wp WHERE wp.webinar_id = w.id AND wp.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = w.course_id AND e.user_id = auth.uid())
      )
  )
);

-- Vote view: limit to same audience (not всем)
DROP POLICY IF EXISTS "View votes" ON public.webinar_poll_votes;
DROP POLICY IF EXISTS "Anon view votes" ON public.webinar_poll_votes;
CREATE POLICY "View poll votes"
ON public.webinar_poll_votes FOR SELECT TO authenticated, anon
USING (
  EXISTS (SELECT 1 FROM webinar_polls p WHERE p.id = webinar_poll_votes.poll_id)
);
