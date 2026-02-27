
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Org users can insert lesson attachments" ON public.lesson_attachments;
DROP POLICY IF EXISTS "Org users can update lesson attachments" ON public.lesson_attachments;
DROP POLICY IF EXISTS "Org users can delete lesson attachments" ON public.lesson_attachments;

-- Recreate with admin bypass
CREATE POLICY "Org or admin can insert lesson attachments"
ON public.lesson_attachments FOR INSERT TO authenticated
WITH CHECK (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = lesson_attachments.lesson_id
      AND c.organization_id = current_organization_id()
  )
);

CREATE POLICY "Org or admin can update lesson attachments"
ON public.lesson_attachments FOR UPDATE TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = lesson_attachments.lesson_id
      AND c.organization_id = current_organization_id()
  )
);

CREATE POLICY "Org or admin can delete lesson attachments"
ON public.lesson_attachments FOR DELETE TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = lesson_attachments.lesson_id
      AND c.organization_id = current_organization_id()
  )
);
