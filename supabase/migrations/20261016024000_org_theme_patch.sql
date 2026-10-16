-- Merge only the theme subtree under the row lock. Never replace branding from
-- a stale client snapshot; unrelated icon/logo/cover fields remain untouched.
BEGIN;
CREATE OR REPLACE FUNCTION public.update_organization_theme(p_organization_id uuid, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $fn$
DECLARE v_theme jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.account_deletion_access_allowed(), false)
     OR NOT COALESCE(public.can_access_organization(p_organization_id, 'settings.write'), false) THEN
    RAISE EXCEPTION 'Organization settings permission required' USING ERRCODE = '42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('themeId','themeMode','animLevel','accentHsl','density','radius','enforce')) THEN
    RAISE EXCEPTION 'Invalid theme patch' USING ERRCODE = '22023';
  END IF;
  IF (p_patch ? 'themeId' AND p_patch->'themeId' <> 'null'::jsonb AND (jsonb_typeof(p_patch->'themeId') <> 'string' OR length(p_patch->>'themeId') > 100))
     OR (p_patch ? 'themeMode' AND COALESCE(p_patch->>'themeMode','') NOT IN ('light','dark','system'))
     OR (p_patch ? 'animLevel' AND COALESCE(p_patch->>'animLevel','') NOT IN ('full','reduced','none'))
     OR (p_patch ? 'density' AND COALESCE(p_patch->>'density','') NOT IN ('compact','default','comfortable'))
     OR (p_patch ? 'radius' AND COALESCE(p_patch->>'radius','') NOT IN ('sharp','default','soft'))
     OR (p_patch ? 'enforce' AND jsonb_typeof(p_patch->'enforce') <> 'boolean')
     OR (p_patch ? 'accentHsl' AND p_patch->'accentHsl' <> 'null'::jsonb AND (jsonb_typeof(p_patch->'accentHsl') <> 'string' OR (p_patch->>'accentHsl') !~ '^[0-9]{1,3}(\.[0-9]+)? [0-9]{1,3}(\.[0-9]+)?% [0-9]{1,3}(\.[0-9]+)?%$')) THEN
    RAISE EXCEPTION 'Invalid theme value' USING ERRCODE = '22023';
  END IF;
  UPDATE public.organizations
     SET branding = COALESCE(branding, '{}'::jsonb) || jsonb_build_object('orgTheme',
       CASE WHEN jsonb_typeof(COALESCE(branding->'orgTheme', branding->'org_theme')) = 'object'
         THEN COALESCE(branding->'orgTheme', branding->'org_theme') ELSE '{}'::jsonb END || p_patch)
   WHERE id = p_organization_id
   RETURNING branding->'orgTheme' INTO v_theme;
  IF NOT FOUND OR v_theme IS NULL THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_theme;
END;
$fn$;
REVOKE ALL ON FUNCTION public.update_organization_theme(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_organization_theme(uuid, jsonb) TO authenticated;
COMMIT;
