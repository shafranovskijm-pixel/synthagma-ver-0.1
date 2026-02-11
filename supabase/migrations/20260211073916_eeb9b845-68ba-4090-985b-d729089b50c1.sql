
-- Create testimonials table
CREATE TABLE public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  highlight text,
  rating integer NOT NULL DEFAULT 5,
  author_name text NOT NULL,
  author_role text,
  is_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

-- Anyone can see approved testimonials (public landing page)
CREATE POLICY "Anyone can view approved testimonials"
ON public.testimonials FOR SELECT
USING (is_approved = true);

-- Org users can see their own testimonials (even unapproved)
CREATE POLICY "Org users can view own testimonials"
ON public.testimonials FOR SELECT
USING (user_id = auth.uid());

-- Org users can insert testimonials
CREATE POLICY "Org users can insert testimonials"
ON public.testimonials FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND has_role('organization'::app_role, auth.uid())
);

-- Admins can update testimonials (approve/reject)
CREATE POLICY "Admins can update testimonials"
ON public.testimonials FOR UPDATE
USING (has_role('admin'::app_role, auth.uid()));

-- Admins can delete testimonials
CREATE POLICY "Admins can delete testimonials"
ON public.testimonials FOR DELETE
USING (has_role('admin'::app_role, auth.uid()));
