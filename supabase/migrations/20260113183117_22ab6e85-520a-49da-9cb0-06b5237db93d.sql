-- Add policy to allow org users to delete profiles in their organization
CREATE POLICY "Org users can delete profiles in their org"
ON public.profiles
FOR DELETE
USING (organization_id = current_organization_id());