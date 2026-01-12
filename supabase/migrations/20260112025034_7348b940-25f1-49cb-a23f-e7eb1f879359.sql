-- Drop the restrictive policy
DROP POLICY IF EXISTS "Public can create organizations" ON public.organizations;

-- Create a PERMISSIVE policy (default) that allows anyone to insert
CREATE POLICY "Allow public organization creation"
ON public.organizations
FOR INSERT
TO anon, authenticated
WITH CHECK (true);