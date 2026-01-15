-- Add login branding fields to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS login_branding JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS login_slug TEXT UNIQUE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS website_url TEXT DEFAULT NULL;

-- Create index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_organizations_login_slug ON public.organizations(login_slug) WHERE login_slug IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.organizations.login_branding IS 'JSON object containing login page branding settings: backgroundUrl, logoUrl, primaryColor, secondaryColor, welcomeText, description';
COMMENT ON COLUMN public.organizations.login_slug IS 'Unique slug for branded login page URL, e.g., /login/my-org';
COMMENT ON COLUMN public.organizations.website_url IS 'Organization website URL for display on login page';