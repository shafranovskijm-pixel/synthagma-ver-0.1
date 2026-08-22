-- The original organization UPDATE policy predates granular org_staff
-- permissions. PostgreSQL combines permissive policies with OR, so leaving it
-- in place would bypass the later settings.write policy.
DROP POLICY IF EXISTS "Org users can update their organization" ON public.organizations;

-- Preserve an already-correct canonical policy. If an installation has no
-- policy with this name, or has a stale definition, replace only that policy.
DO $migration$
DECLARE
  v_policy_is_canonical boolean := false;
BEGIN
  SELECT
    cmd = 'UPDATE'
    AND permissive = 'PERMISSIVE'
    AND roles = ARRAY['authenticated']::name[]
    AND COALESCE(qual, '') ~ $pattern$can_access_organization\s*\(\s*id\s*,\s*'settings\.write'(?:::text)?\s*\)$pattern$
    AND COALESCE(with_check, '') ~ $pattern$can_access_organization\s*\(\s*id\s*,\s*'settings\.write'(?:::text)?\s*\)$pattern$
  INTO v_policy_is_canonical
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'organizations'
    AND policyname = 'Org staff can update organization'
  LIMIT 1;

  IF NOT COALESCE(v_policy_is_canonical, false) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Org staff can update organization" ON public.organizations';
    EXECUTE $policy$
      CREATE POLICY "Org staff can update organization"
      ON public.organizations
      FOR UPDATE
      TO authenticated
      USING (public.can_access_organization(id, 'settings.write'))
      WITH CHECK (public.can_access_organization(id, 'settings.write'))
    $policy$;
  END IF;
END;
$migration$;
