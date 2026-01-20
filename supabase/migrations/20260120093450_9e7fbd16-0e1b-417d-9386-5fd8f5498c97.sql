-- Fix security issues: Restrict profile and FRDO data access

-- ============================================
-- 1. Update profiles RLS policies
-- Issue: "Org users can view profiles in their org" allows students to see other students
-- Solution: Restrict org-level access to only organization and admin roles
-- ============================================

-- Drop the overly permissive org policy
DROP POLICY IF EXISTS "Org users can view profiles in their org" ON profiles;

-- Create new policy that only allows org/admin roles to view all org profiles
CREATE POLICY "Org admins can view profiles in their org"
ON profiles FOR SELECT
USING (
  (organization_id = current_organization_id() AND has_role('organization'::app_role, auth.uid()))
  OR has_role('admin'::app_role, auth.uid())
);

-- Drop the overly permissive delete policy
DROP POLICY IF EXISTS "Org users can delete profiles in their org" ON profiles;

-- Create new policy that only allows org/admin roles to delete profiles
CREATE POLICY "Org admins can delete profiles in their org"
ON profiles FOR DELETE
USING (
  (organization_id = current_organization_id() AND has_role('organization'::app_role, auth.uid()))
  OR has_role('admin'::app_role, auth.uid())
);

-- ============================================
-- 2. Update student_frdo_data RLS policies  
-- Issue: All org users (including students) can view sensitive FRDO data
-- Solution: Restrict to only organization and admin roles
-- ============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Org users can manage their students FRDO data" ON student_frdo_data;

-- Create new policy that only allows org/admin roles to manage FRDO data
CREATE POLICY "Org admins can manage students FRDO data"
ON student_frdo_data FOR ALL
USING (
  (organization_id = current_organization_id() AND has_role('organization'::app_role, auth.uid()))
  OR has_role('admin'::app_role, auth.uid())
)
WITH CHECK (
  (organization_id = current_organization_id() AND has_role('organization'::app_role, auth.uid()))
  OR has_role('admin'::app_role, auth.uid())
);

-- Students can still view and update their own FRDO data (existing policies remain)