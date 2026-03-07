
-- Create webinars table
CREATE TABLE public.webinars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  access_type TEXT NOT NULL DEFAULT 'org_all' CHECK (access_type IN ('enrolled', 'org_all', 'course', 'company')),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  room_url TEXT,
  room_name TEXT,
  recording_url TEXT,
  recording_size_bytes BIGINT DEFAULT 0,
  host_user_id UUID NOT NULL,
  max_participants INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create webinar_participants table
CREATE TABLE public.webinar_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('host', 'viewer'))
);

-- Indexes
CREATE INDEX idx_webinars_organization_id ON public.webinars(organization_id);
CREATE INDEX idx_webinars_status ON public.webinars(status);
CREATE INDEX idx_webinars_scheduled_at ON public.webinars(scheduled_at);
CREATE INDEX idx_webinar_participants_webinar_id ON public.webinar_participants(webinar_id);
CREATE INDEX idx_webinar_participants_user_id ON public.webinar_participants(user_id);

-- Updated_at trigger
CREATE TRIGGER update_webinars_updated_at
  BEFORE UPDATE ON public.webinars
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.webinars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_participants ENABLE ROW LEVEL SECURITY;

-- RLS for webinars: org users can manage their own webinars
CREATE POLICY "Org users can manage own webinars"
  ON public.webinars
  FOR ALL
  TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- RLS for webinars: students can view accessible webinars
CREATE POLICY "Students can view accessible webinars"
  ON public.webinars
  FOR SELECT
  TO authenticated
  USING (
    -- org_all: any student in the same org
    (access_type = 'org_all' AND organization_id IN (
      SELECT p.organization_id FROM profiles p WHERE p.user_id = auth.uid()
    ))
    OR
    -- course: student enrolled in that course
    (access_type = 'course' AND course_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM enrollments e WHERE e.user_id = auth.uid() AND e.course_id = webinars.course_id
    ))
    OR
    -- company: student belongs to that company
    (access_type = 'company' AND company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.company_id = webinars.company_id
    ))
    OR
    -- enrolled: student enrolled in any course of the org
    (access_type = 'enrolled' AND EXISTS (
      SELECT 1 FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      WHERE e.user_id = auth.uid() AND c.organization_id = webinars.organization_id
    ))
  );

-- RLS for webinar_participants: org users and the participant themselves
CREATE POLICY "Org users can manage participants"
  ON public.webinar_participants
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role('admin'::app_role, auth.uid())
    OR EXISTS (
      SELECT 1 FROM webinars w
      WHERE w.id = webinar_participants.webinar_id
        AND w.organization_id = current_organization_id()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR has_role('admin'::app_role, auth.uid())
    OR EXISTS (
      SELECT 1 FROM webinars w
      WHERE w.id = webinar_participants.webinar_id
        AND w.organization_id = current_organization_id()
    )
  );

-- Storage bucket for recordings (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('webinar-recordings', 'webinar-recordings', false);

-- Storage RLS: org users can upload/manage recordings
CREATE POLICY "Org users can manage webinar recordings"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'webinar-recordings' AND (
    has_role('organization'::app_role, auth.uid())
    OR has_role('admin'::app_role, auth.uid())
  ))
  WITH CHECK (bucket_id = 'webinar-recordings' AND (
    has_role('organization'::app_role, auth.uid())
    OR has_role('admin'::app_role, auth.uid())
  ));

-- Storage RLS: authenticated users can read via signed URLs (handled by Supabase)
CREATE POLICY "Authenticated can read webinar recordings"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'webinar-recordings');

-- Add webinars to feature categories for plans that support it (standard+)
-- Update the apply_plan_features_on_change function to include webinars
CREATE OR REPLACE FUNCTION public.apply_plan_features_on_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  plan_categories TEXT[];
  all_categories TEXT[] := ARRAY['courses','students','companies','documents',
    'journals','frdo','links','library','services','settings','student_cabinet','labor_safety','webinars'];
  cat TEXT;
BEGIN
  IF NEW.subscription_plan IS NOT DISTINCT FROM OLD.subscription_plan THEN
    RETURN NEW;
  END IF;

  plan_categories := CASE NEW.subscription_plan
    WHEN 'free' THEN ARRAY['courses','students','services','settings','student_cabinet']
    WHEN 'start' THEN ARRAY['courses','students','companies','links','services','settings','student_cabinet']
    WHEN 'standard' THEN ARRAY['courses','students','companies','links','services','settings','student_cabinet','webinars']
    WHEN 'professional' THEN ARRAY['courses','students','companies','documents','journals','links','library','services','settings','student_cabinet','labor_safety','webinars']
    WHEN 'maximum' THEN ARRAY['courses','students','companies','documents','journals','frdo','links','library','services','settings','student_cabinet','labor_safety','webinars']
    ELSE ARRAY['courses','students','settings','student_cabinet']
  END;

  FOREACH cat IN ARRAY all_categories LOOP
    INSERT INTO organization_feature_categories (organization_id, category_id, is_enabled)
    VALUES (NEW.id, cat, cat = ANY(plan_categories))
    ON CONFLICT (organization_id, category_id)
    DO UPDATE SET is_enabled = (cat = ANY(plan_categories));
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Enable realtime for webinars
ALTER PUBLICATION supabase_realtime ADD TABLE public.webinars;
