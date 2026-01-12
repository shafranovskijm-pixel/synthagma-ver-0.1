-- Drop the existing policy
DROP POLICY IF EXISTS "Anyone can create organizations" ON public.organizations;

-- Create a permissive policy that allows anyone (including anonymous) to insert
CREATE POLICY "Public can create organizations"
ON public.organizations
FOR INSERT
TO public
WITH CHECK (true);