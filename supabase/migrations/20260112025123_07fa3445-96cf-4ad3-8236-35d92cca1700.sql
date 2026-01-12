-- First, let's disable RLS temporarily to test, then re-enable with proper policy
-- Drop all INSERT policies first
DROP POLICY IF EXISTS "Allow public organization creation" ON public.organizations;
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Anyone can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Public can create organizations" ON public.organizations;

-- Recreate with explicit grant to anon role
CREATE POLICY "public_insert_organizations"
ON public.organizations
AS PERMISSIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Also grant INSERT permission to anon role explicitly
GRANT INSERT ON public.organizations TO anon;
GRANT INSERT ON public.organizations TO authenticated;