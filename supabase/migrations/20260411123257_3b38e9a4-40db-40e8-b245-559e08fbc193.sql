
-- Add cover_image_url and landing_content to courses
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS landing_content jsonb DEFAULT '{}'::jsonb;

-- Add description to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS description text;
