-- Allow admins to delete profiles
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
USING (has_role('admin'::app_role, auth.uid()));

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (has_role('admin'::app_role, auth.uid()));

-- Allow admins to manage all user roles
CREATE POLICY "Admins can manage all user roles"
ON public.user_roles
FOR ALL
USING (has_role('admin'::app_role, auth.uid()));

-- Allow admins to delete organizations
CREATE POLICY "Admins can delete organizations"
ON public.organizations
FOR DELETE
USING (has_role('admin'::app_role, auth.uid()));