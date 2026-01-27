-- Fix student_consents RLS policies to restrict sensitive data access to organization admins only
-- Instead of allowing all organization members to view consents, restrict to organization role users only

-- Drop existing policies that are too permissive
DROP POLICY IF EXISTS "Organizations can view consents of their students" ON public.student_consents;
DROP POLICY IF EXISTS "Organizations can update consent status" ON public.student_consents;

-- Create stricter policy: Only organization role users can view student consents
CREATE POLICY "Org admins can view consents of their students" 
ON public.student_consents 
FOR SELECT 
USING (
  -- User is in same organization AND has organization/admin role
  (EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id = auth.uid() 
    AND p.organization_id = student_consents.organization_id
    AND ur.role IN ('organization', 'admin')
  ))
  OR
  -- Global admin
  has_role('admin'::app_role, auth.uid())
);

-- Create stricter policy: Only organization role users can update consent status
CREATE POLICY "Org admins can update consent status" 
ON public.student_consents 
FOR UPDATE 
USING (
  -- User is in same organization AND has organization/admin role
  (EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id = auth.uid() 
    AND p.organization_id = student_consents.organization_id
    AND ur.role IN ('organization', 'admin')
  ))
  OR
  -- Global admin
  has_role('admin'::app_role, auth.uid())
);

-- Add comment explaining the security rationale
COMMENT ON TABLE public.student_consents IS 'Student consent documents with sensitive PII (passport data, address). Access restricted to organization admins only, not all organization members.';