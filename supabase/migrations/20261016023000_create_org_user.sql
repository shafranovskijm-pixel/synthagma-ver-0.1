-- Auth signup already inserts profiles and the default student role. Provision
-- the organization account atomically instead of attempting duplicate INSERTs.
BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_created_org_user(
  p_user_id uuid,
  p_organization_id uuid,
  p_full_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_email text;
  v_count integer;
BEGIN
  -- This helper is only for a service-role edge handler after successful Auth
  -- creation. Browser callers, including platform admins, cannot invoke it.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_organization_id IS NULL OR p_full_name IS NULL
      OR length(btrim(p_full_name)) = 0 OR length(p_full_name) > 300 THEN
    RAISE EXCEPTION 'Invalid organization account' USING ERRCODE = '22023';
  END IF;
  PERFORM id FROM public.organizations WHERE id = p_organization_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_email IS NULL THEN
    RAISE EXCEPTION 'Created Auth user not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
     SET email = v_email, full_name = btrim(p_full_name), organization_id = p_organization_id
   WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Signup profile not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.user_roles SET role = 'organization' WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Signup role not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.user_id
     WHERE p.user_id = p_user_id AND p.organization_id = p_organization_id
       AND p.email = v_email AND p.full_name = btrim(p_full_name) AND r.role = 'organization'
  ) THEN
    RAISE EXCEPTION 'Organization account not confirmed' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('userId', p_user_id, 'organizationId', p_organization_id, 'role', 'organization');
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalize_created_org_user(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_created_org_user(uuid, uuid, text) TO service_role;
COMMENT ON FUNCTION public.finalize_created_org_user(uuid, uuid, text) IS
  'Service-only finalization of a new Auth user: confirms profile, organization and role atomically.';

COMMIT;
