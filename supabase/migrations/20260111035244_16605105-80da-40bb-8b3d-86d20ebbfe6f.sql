-- Drop existing lessons policies
DROP POLICY IF EXISTS "Org users can manage lessons" ON public.lessons;
DROP POLICY IF EXISTS "Lessons viewable if enrolled or org user" ON public.lessons;

-- Create updated policies that also allow admins
CREATE POLICY "Lessons viewable if enrolled or org user or admin" 
ON public.lessons 
FOR SELECT 
USING (
  -- Admins can view all lessons
  has_role('admin'::app_role, auth.uid())
  OR
  -- Published course lessons are viewable by all
  (EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = lessons.course_id AND c.is_published = true
  ))
  OR
  -- Org users can view their own course lessons
  (EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = lessons.course_id AND c.organization_id = current_organization_id()
  ))
);

CREATE POLICY "Org users and admins can manage lessons" 
ON public.lessons 
FOR ALL 
USING (
  -- Admins can manage all lessons
  has_role('admin'::app_role, auth.uid())
  OR
  -- Org users can manage their own course lessons
  (EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = lessons.course_id AND c.organization_id = current_organization_id()
  ))
)
WITH CHECK (
  -- Admins can manage all lessons
  has_role('admin'::app_role, auth.uid())
  OR
  -- Org users can manage their own course lessons
  (EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = lessons.course_id AND c.organization_id = current_organization_id()
  ))
);