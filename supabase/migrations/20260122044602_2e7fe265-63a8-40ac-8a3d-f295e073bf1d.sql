-- Add RLS policy for organizations to view their own credentials
-- This allows organizations to see their own login info while keeping others' credentials private

CREATE POLICY "Organizations can view own credentials" 
ON public.organization_credentials 
FOR SELECT 
USING (
  organization_id IN (
    SELECT p.organization_id 
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id = auth.uid() 
    AND ur.role = 'organization'
  )
);