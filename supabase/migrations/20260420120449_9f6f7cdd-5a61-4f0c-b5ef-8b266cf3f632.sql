
-- Global module unlock schedules
CREATE TABLE public.module_access_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID NOT NULL UNIQUE REFERENCES public.course_modules(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  unlock_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_module_access_schedules_course ON public.module_access_schedules(course_id);

ALTER TABLE public.module_access_schedules ENABLE ROW LEVEL SECURITY;

-- Per-user overrides
CREATE TABLE public.module_access_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  unlock_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_id, user_id)
);

CREATE INDEX idx_module_access_overrides_module ON public.module_access_overrides(module_id);
CREATE INDEX idx_module_access_overrides_user ON public.module_access_overrides(user_id);

ALTER TABLE public.module_access_overrides ENABLE ROW LEVEL SECURITY;

-- Triggers for updated_at
CREATE TRIGGER trg_mas_updated_at
  BEFORE UPDATE ON public.module_access_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_mao_updated_at
  BEFORE UPDATE ON public.module_access_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RLS: module_access_schedules ============

-- Admins: full access
CREATE POLICY "Admins manage all module schedules"
ON public.module_access_schedules
FOR ALL
USING (has_role('admin'::app_role, auth.uid()))
WITH CHECK (has_role('admin'::app_role, auth.uid()));

-- Org managers: manage schedules for own courses
CREATE POLICY "Org manages module schedules of own courses"
ON public.module_access_schedules
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = module_access_schedules.course_id
      AND c.organization_id = current_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = module_access_schedules.course_id
      AND c.organization_id = current_organization_id()
  )
);

-- Enrolled students: read schedules of courses they are enrolled in
CREATE POLICY "Enrolled students read module schedules"
ON public.module_access_schedules
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.course_id = module_access_schedules.course_id
      AND e.user_id = auth.uid()
  )
);

-- ============ RLS: module_access_overrides ============

-- Admins: full access
CREATE POLICY "Admins manage all module overrides"
ON public.module_access_overrides
FOR ALL
USING (has_role('admin'::app_role, auth.uid()))
WITH CHECK (has_role('admin'::app_role, auth.uid()));

-- Org managers: manage overrides for modules of their courses
CREATE POLICY "Org manages module overrides of own courses"
ON public.module_access_overrides
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.course_modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = module_access_overrides.module_id
      AND c.organization_id = current_organization_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.course_modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = module_access_overrides.module_id
      AND c.organization_id = current_organization_id()
  )
);

-- Students: read only their own overrides
CREATE POLICY "Students read own module overrides"
ON public.module_access_overrides
FOR SELECT
USING (user_id = auth.uid());
