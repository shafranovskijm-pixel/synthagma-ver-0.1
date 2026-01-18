-- Fix RLS for profiles table - remove public access
-- First drop the existing public policy if it exists
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;

-- Ensure only authenticated users in the same org can view profiles
-- Keep existing org-scoped policy but ensure it requires authentication
DROP POLICY IF EXISTS "Org users can view profiles in their org" ON public.profiles;
CREATE POLICY "Org users can view profiles in their org" 
ON public.profiles FOR SELECT 
TO authenticated
USING (organization_id = current_organization_id());

-- Admins can view all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT 
TO authenticated
USING (has_role('admin'::app_role, auth.uid()));

-- Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
TO authenticated
USING (user_id = auth.uid());

-- Fix RLS for registration_links table - restrict to org members only
DROP POLICY IF EXISTS "Anyone can view registration links" ON public.registration_links;
DROP POLICY IF EXISTS "Public can view registration links" ON public.registration_links;
DROP POLICY IF EXISTS "registration_links_select_all" ON public.registration_links;

-- Only org users can view their organization's registration links
DROP POLICY IF EXISTS "Org users can view their links" ON public.registration_links;
CREATE POLICY "Org users can view their links" 
ON public.registration_links FOR SELECT 
TO authenticated
USING (organization_id = current_organization_id());

-- Admins can view all registration links
DROP POLICY IF EXISTS "Admins can view all registration links" ON public.registration_links;
CREATE POLICY "Admins can view all registration links" 
ON public.registration_links FOR SELECT 
TO authenticated
USING (has_role('admin'::app_role, auth.uid()));

-- Allow public access to registration links ONLY by token (for join by link)
DROP POLICY IF EXISTS "Public can access link by token" ON public.registration_links;
CREATE POLICY "Public can access link by token" 
ON public.registration_links FOR SELECT 
TO anon, authenticated
USING (true);
-- Note: The actual token validation happens in the application layer
-- This policy is needed for join by link functionality but the token lookup is restricted

-- Actually, let's be more restrictive - only allow access to specific fields via RPC
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Public can access link by token" ON public.registration_links;

-- Create a secure function to validate registration links
CREATE OR REPLACE FUNCTION public.get_registration_link_by_token(link_token TEXT)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  course_id UUID,
  company_id UUID,
  name TEXT,
  expires_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rl.id,
    rl.organization_id,
    rl.course_id,
    rl.company_id,
    rl.name,
    rl.expires_at
  FROM registration_links rl
  WHERE rl.token = link_token
    AND (rl.expires_at IS NULL OR rl.expires_at > NOW());
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_registration_link_by_token TO anon;
GRANT EXECUTE ON FUNCTION public.get_registration_link_by_token TO authenticated;