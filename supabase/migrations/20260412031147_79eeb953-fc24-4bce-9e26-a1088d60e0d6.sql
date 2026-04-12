
-- Fix labor_safety_groups: add admin bypass to all policies
DROP POLICY IF EXISTS "Users can view labor safety groups of their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can view labor safety groups of their organization"
  ON public.labor_safety_groups FOR SELECT
  USING (
    (organization_id IN (SELECT profiles.organization_id FROM profiles WHERE profiles.user_id = auth.uid()))
    OR has_role('admin'::app_role, auth.uid())
  );

DROP POLICY IF EXISTS "Users can create labor safety groups in their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can create labor safety groups in their organization"
  ON public.labor_safety_groups FOR INSERT
  WITH CHECK (
    (organization_id IN (SELECT profiles.organization_id FROM profiles WHERE profiles.user_id = auth.uid()))
    OR has_role('admin'::app_role, auth.uid())
  );

DROP POLICY IF EXISTS "Users can update labor safety groups in their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can update labor safety groups in their organization"
  ON public.labor_safety_groups FOR UPDATE
  USING (
    (organization_id IN (SELECT profiles.organization_id FROM profiles WHERE profiles.user_id = auth.uid()))
    OR has_role('admin'::app_role, auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete labor safety groups in their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can delete labor safety groups in their organization"
  ON public.labor_safety_groups FOR DELETE
  USING (
    (organization_id IN (SELECT profiles.organization_id FROM profiles WHERE profiles.user_id = auth.uid()))
    OR has_role('admin'::app_role, auth.uid())
  );

-- Fix labor_safety_records: add admin bypass
DROP POLICY IF EXISTS "Users can view labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can view labor safety records"
  ON public.labor_safety_records FOR SELECT
  USING (
    (group_id IN (SELECT id FROM labor_safety_groups WHERE organization_id IN (SELECT profiles.organization_id FROM profiles WHERE profiles.user_id = auth.uid())))
    OR has_role('admin'::app_role, auth.uid())
  );

-- Also fix INSERT/UPDATE/DELETE on labor_safety_records if they exist
DROP POLICY IF EXISTS "Users can create labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can create labor safety records"
  ON public.labor_safety_records FOR INSERT
  WITH CHECK (
    (group_id IN (SELECT id FROM labor_safety_groups WHERE organization_id IN (SELECT profiles.organization_id FROM profiles WHERE profiles.user_id = auth.uid())))
    OR has_role('admin'::app_role, auth.uid())
  );

DROP POLICY IF EXISTS "Users can update labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can update labor safety records"
  ON public.labor_safety_records FOR UPDATE
  USING (
    (group_id IN (SELECT id FROM labor_safety_groups WHERE organization_id IN (SELECT profiles.organization_id FROM profiles WHERE profiles.user_id = auth.uid())))
    OR has_role('admin'::app_role, auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can delete labor safety records"
  ON public.labor_safety_records FOR DELETE
  USING (
    (group_id IN (SELECT id FROM labor_safety_groups WHERE organization_id IN (SELECT profiles.organization_id FROM profiles WHERE profiles.user_id = auth.uid())))
    OR has_role('admin'::app_role, auth.uid())
  );
