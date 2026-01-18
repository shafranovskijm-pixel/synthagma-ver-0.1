-- SECURITY FIX: Remove public login lookup policy that exposes usernames
DROP POLICY IF EXISTS "Anyone can lookup profiles by login" ON public.profiles;

-- Create a secure function for login lookup (authenticated only)
CREATE OR REPLACE FUNCTION public.lookup_profile_by_login(p_login text)
RETURNS TABLE(user_id uuid, full_name text, organization_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only allow authenticated users to lookup
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  RETURN QUERY
  SELECT p.user_id, p.full_name, p.organization_id
  FROM profiles p
  WHERE p.login = p_login
  LIMIT 1;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.lookup_profile_by_login(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.lookup_profile_by_login(text) FROM anon;

-- Create a safe view for profile data that excludes sensitive fields
CREATE OR REPLACE VIEW public.profiles_safe AS 
SELECT 
  id, 
  user_id, 
  full_name, 
  organization_id, 
  company_id, 
  avatar_url, 
  created_at, 
  updated_at, 
  last_visit_at
  -- Explicitly excluded: email, login, generated_password
FROM public.profiles;

-- Enable RLS on profiles_safe view
ALTER VIEW public.profiles_safe SET (security_invoker = true);

-- Grant read access to authenticated users
GRANT SELECT ON public.profiles_safe TO authenticated;

-- Revoke access from anon
REVOKE SELECT ON public.profiles_safe FROM anon;