
-- 1. Create course_modules table
CREATE TABLE public.course_modules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Новый модуль',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_modules_course_id ON public.course_modules(course_id);
CREATE INDEX idx_course_modules_order ON public.course_modules(course_id, order_index);

-- 2. Add module_id to lessons
ALTER TABLE public.lessons
  ADD COLUMN module_id uuid NULL REFERENCES public.course_modules(id) ON DELETE SET NULL;

CREATE INDEX idx_lessons_module_id ON public.lessons(module_id);

-- 3. Enable RLS
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies — match lessons access pattern
-- SELECT: anyone who can read the course can read its modules
CREATE POLICY "Modules viewable by course viewers"
ON public.course_modules
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_modules.course_id
      AND (
        c.is_published = true
        OR c.organization_id = public.current_organization_id()
        OR public.has_role('admin'::app_role, auth.uid())
      )
  )
);

-- INSERT: organization owners/staff and admins
CREATE POLICY "Org and admins can create modules"
ON public.course_modules
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_modules.course_id
      AND (
        c.organization_id = public.current_organization_id()
        OR public.has_role('admin'::app_role, auth.uid())
      )
  )
);

-- UPDATE: organization owners/staff and admins
CREATE POLICY "Org and admins can update modules"
ON public.course_modules
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_modules.course_id
      AND (
        c.organization_id = public.current_organization_id()
        OR public.has_role('admin'::app_role, auth.uid())
      )
  )
);

-- DELETE: organization owners/staff and admins
CREATE POLICY "Org and admins can delete modules"
ON public.course_modules
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_modules.course_id
      AND (
        c.organization_id = public.current_organization_id()
        OR public.has_role('admin'::app_role, auth.uid())
      )
  )
);

-- 5. Trigger for updated_at
CREATE TRIGGER update_course_modules_updated_at
BEFORE UPDATE ON public.course_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
