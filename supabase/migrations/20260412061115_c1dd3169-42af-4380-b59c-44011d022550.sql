
-- Add slug and accent_color to courses
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS accent_color text;

-- Create index for slug lookups
CREATE INDEX IF NOT EXISTS idx_courses_slug ON public.courses (slug) WHERE slug IS NOT NULL;

-- Create course_promo_codes table
CREATE TABLE public.course_promo_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_value integer NOT NULL DEFAULT 0,
  discount_type text NOT NULL DEFAULT 'percent',
  is_active boolean NOT NULL DEFAULT true,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.course_promo_codes ENABLE ROW LEVEL SECURITY;

-- RLS: org members can manage promo codes for their courses
CREATE POLICY "Org members can view course promo codes"
ON public.course_promo_codes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_promo_codes.course_id
      AND c.organization_id = public.current_organization_id()
  )
);

CREATE POLICY "Org members can create course promo codes"
ON public.course_promo_codes FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_promo_codes.course_id
      AND c.organization_id = public.current_organization_id()
  )
);

CREATE POLICY "Org members can update course promo codes"
ON public.course_promo_codes FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_promo_codes.course_id
      AND c.organization_id = public.current_organization_id()
  )
);

CREATE POLICY "Org members can delete course promo codes"
ON public.course_promo_codes FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_promo_codes.course_id
      AND c.organization_id = public.current_organization_id()
  )
);

-- Public can validate promo codes (for landing page)
CREATE POLICY "Anyone can read active promo codes"
ON public.course_promo_codes FOR SELECT
TO anon
USING (is_active = true AND (valid_until IS NULL OR valid_until > now()));
