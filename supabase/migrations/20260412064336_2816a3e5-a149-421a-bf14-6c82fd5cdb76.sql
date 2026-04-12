
-- Pending enrollments table
CREATE TABLE public.pending_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  course_title TEXT NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_enrollments_org ON public.pending_enrollments(organization_id);
CREATE INDEX idx_pending_enrollments_status ON public.pending_enrollments(status);
CREATE INDEX idx_pending_enrollments_course_title ON public.pending_enrollments(organization_id, course_title) WHERE status = 'pending';

ALTER TABLE public.pending_enrollments ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins full access on pending_enrollments"
ON public.pending_enrollments FOR ALL
USING (public.has_role('admin'::app_role, auth.uid()));

-- Org managers can manage their own
CREATE POLICY "Org managers can view own pending_enrollments"
ON public.pending_enrollments FOR SELECT
USING (public.has_role('organization'::app_role, auth.uid()) AND organization_id = public.current_organization_id());

CREATE POLICY "Org managers can insert own pending_enrollments"
ON public.pending_enrollments FOR INSERT
WITH CHECK (public.has_role('organization'::app_role, auth.uid()) AND organization_id = public.current_organization_id());

CREATE POLICY "Org managers can update own pending_enrollments"
ON public.pending_enrollments FOR UPDATE
USING (public.has_role('organization'::app_role, auth.uid()) AND organization_id = public.current_organization_id());

-- Trigger: auto-enroll when course appears
CREATE OR REPLACE FUNCTION public.resolve_pending_enrollments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT pe.id, pe.user_id
    FROM pending_enrollments pe
    WHERE pe.organization_id = NEW.organization_id
      AND pe.status = 'pending'
      AND lower(trim(pe.course_title)) = lower(trim(NEW.title))
  LOOP
    BEGIN
      INSERT INTO enrollments (user_id, course_id, status, progress, time_spent)
      VALUES (rec.user_id, NEW.id, 'active', 0, 0)
      ON CONFLICT DO NOTHING;

      UPDATE pending_enrollments
      SET status = 'enrolled', course_id = NEW.id, updated_at = now()
      WHERE id = rec.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE pending_enrollments
      SET status = 'failed', updated_at = now()
      WHERE id = rec.id;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resolve_pending_enrollments
AFTER INSERT ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.resolve_pending_enrollments();

-- Updated_at trigger
CREATE TRIGGER update_pending_enrollments_updated_at
BEFORE UPDATE ON public.pending_enrollments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
