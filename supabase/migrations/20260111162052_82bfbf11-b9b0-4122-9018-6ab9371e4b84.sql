-- Add branding settings to organizations table
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.organizations.branding IS 'Organization branding settings: cover_url, primary_color, secondary_color, logo_url, etc.';

-- Create storage bucket for organization branding assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-branding', 'org-branding', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for org-branding bucket
CREATE POLICY "Public can view org branding assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'org-branding');

CREATE POLICY "Organization users can upload branding assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'org-branding' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Organization users can update their branding assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'org-branding' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Organization users can delete their branding assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'org-branding' AND
  auth.uid()::text = (storage.foldername(name))[1]
);