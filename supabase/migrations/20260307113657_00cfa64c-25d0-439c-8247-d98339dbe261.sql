
CREATE TABLE public.platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage announcements"
ON public.platform_announcements
FOR ALL
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()))
WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

-- All authenticated users can read announcements
CREATE POLICY "All users can read announcements"
ON public.platform_announcements
FOR SELECT
TO authenticated
USING (true);
