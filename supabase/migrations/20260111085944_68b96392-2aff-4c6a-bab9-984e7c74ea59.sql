-- Drop the vulnerable policies and any existing secure policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can update own role once" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;

-- Create secure policy: only authenticated users can create organizations
CREATE POLICY "Authenticated users can create organizations" 
ON public.organizations 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create admin-only policy for role updates
CREATE POLICY "Admins can update user roles" ON public.user_roles 
FOR UPDATE 
USING (has_role('admin', auth.uid()))
WITH CHECK (has_role('admin', auth.uid()));

-- Create secure RPC function for organization registration
-- This allows a student to upgrade to organization role only during registration
CREATE OR REPLACE FUNCTION public.upgrade_to_organization_role(
  p_user_id UUID,
  p_organization_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is the user being upgraded
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: can only upgrade own role';
  END IF;
  
  -- Verify user is currently a student
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = p_user_id AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'Invalid role transition: must be student';
  END IF;
  
  -- Verify user owns this organization (profile is linked)
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = p_user_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: not linked to organization';
  END IF;
  
  -- Verify organization exists
  IF NOT EXISTS (
    SELECT 1 FROM organizations WHERE id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;
  
  -- Update role to organization
  UPDATE user_roles SET role = 'organization' WHERE user_id = p_user_id;
END;
$$;

-- Create admin-only function for role management
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  p_user_id UUID,
  p_new_role app_role
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_count INTEGER;
  v_current_role app_role;
BEGIN
  -- Verify caller is admin
  IF NOT has_role('admin', auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;
  
  -- Get current role
  SELECT role INTO v_current_role FROM user_roles WHERE user_id = p_user_id;
  
  -- Prevent removing last admin
  IF v_current_role = 'admin' AND p_new_role != 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count FROM user_roles WHERE role = 'admin';
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove last admin';
    END IF;
  END IF;
  
  -- Update role
  UPDATE user_roles SET role = p_new_role WHERE user_id = p_user_id;
END;
$$;