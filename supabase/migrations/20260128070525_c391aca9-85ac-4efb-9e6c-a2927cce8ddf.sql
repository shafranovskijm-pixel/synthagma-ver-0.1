-- Add RLS policy to allow reading organization by login_slug for branded login page
-- This allows unauthenticated users to view organization branding on the login page

CREATE POLICY "Anyone can view organizations by login_slug for branded login"
ON public.organizations
FOR SELECT
USING (login_slug IS NOT NULL);

-- Add comment explaining the policy
COMMENT ON POLICY "Anyone can view organizations by login_slug for branded login" 
ON public.organizations 
IS 'Allows public access to organization data for branded login pages. Only organizations with a login_slug set are accessible this way.';