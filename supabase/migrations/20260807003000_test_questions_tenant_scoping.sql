-- Remove legacy role-only access to correct test answers.
-- Organization users and staff may access questions only through the lesson's
-- course organization. Students continue to use test_questions_for_students.

DROP POLICY IF EXISTS "Org users can view test questions" ON public.test_questions;
DROP POLICY IF EXISTS "Org and admin can view test questions" ON public.test_questions;
DROP POLICY IF EXISTS "Org users can manage test questions" ON public.test_questions;
DROP POLICY IF EXISTS "Org staff can view test questions" ON public.test_questions;
DROP POLICY IF EXISTS "Org staff can manage test questions" ON public.test_questions;

DROP POLICY IF EXISTS test_questions_tenant_select ON public.test_questions;
CREATE POLICY test_questions_tenant_select
ON public.test_questions
FOR SELECT
TO authenticated
USING (public.can_access_lesson(lesson_id, 'courses.read'));

DROP POLICY IF EXISTS test_questions_tenant_write ON public.test_questions;
CREATE POLICY test_questions_tenant_write
ON public.test_questions
FOR ALL
TO authenticated
USING (public.can_access_lesson(lesson_id, 'courses.write'))
WITH CHECK (public.can_access_lesson(lesson_id, 'courses.write'));

-- SECURITY DEFINER helpers must never be callable by anonymous users.
REVOKE ALL ON FUNCTION public.can_access_lesson(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_lesson(uuid, text) TO authenticated, service_role;
