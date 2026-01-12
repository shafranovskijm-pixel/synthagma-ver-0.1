-- Drop the old INSERT policy that requires authenticated user
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;

-- Create a new policy that allows anyone to create organizations (for registration flow)
CREATE POLICY "Anyone can create organizations"
ON public.organizations
FOR INSERT
WITH CHECK (true);