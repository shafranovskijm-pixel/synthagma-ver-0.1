-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "Anyone can create organizations" ON public.organizations;

-- Create a more restrictive INSERT policy - only authenticated users can create
CREATE POLICY "Authenticated users can create organizations" 
ON public.organizations 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);