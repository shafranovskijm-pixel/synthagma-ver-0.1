-- Logins identify accounts; names and shared passwords do not identify people.
-- Preserve original spelling while making account uniqueness case insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_normalized_unique
  ON public.profiles (lower(btrim(login))) WHERE NULLIF(btrim(login), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.student_import_identity_preflight(
  p_organization_id uuid, p_rows jsonb, p_actor_id uuid DEFAULT NULL
)
RETURNS TABLE(row_index integer, login_taken boolean, name_matches integer, email_matches integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_service boolean := COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role',true),'') = 'service_role';
BEGIN
  IF v_service THEN v_actor := p_actor_id;
  ELSIF p_actor_id IS NOT NULL AND p_actor_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'import_actor_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_actor IS NULL OR p_organization_id IS NULL OR NOT COALESCE((
    public.has_role(v_actor, 'admin'::public.app_role)
    OR public.is_org_owner(v_actor, p_organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = v_actor
      AND s.organization_id = p_organization_id AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(v_actor, p_organization_id, 'students.write'))
  ),false) THEN RAISE EXCEPTION 'import_preflight_access_denied' USING ERRCODE = '42501'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'invalid_import_rows' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 250 THEN
    RAISE EXCEPTION 'invalid_import_batch_size' USING ERRCODE = '22023';
  END IF;
  -- Deliberately do not accept or inspect passwords or return identities of other tenants.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE jsonb_typeof(x) <> 'object'
    OR COALESCE(x->>'row_index','') !~ '^[1-9][0-9]{0,8}$'
    OR length(COALESCE(x->>'login','')) > 200 OR length(COALESCE(x->>'full_name','')) > 500
    OR length(COALESCE(x->>'email','')) > 320 OR x ? 'password')
    OR (SELECT count(DISTINCT x->>'row_index') FROM jsonb_array_elements(p_rows) x) <> jsonb_array_length(p_rows) THEN
    RAISE EXCEPTION 'invalid_import_identity' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT (x->>'row_index')::integer,
    EXISTS (SELECT 1 FROM public.profiles p WHERE NULLIF(btrim(x->>'login'),'') IS NOT NULL
      AND lower(btrim(p.login)) = lower(btrim(x->>'login'))),
    (SELECT count(*)::integer FROM public.profiles p WHERE p.organization_id = p_organization_id
      AND public.is_student_profile(p.user_id,p_organization_id)
      AND NULLIF(btrim(x->>'full_name'),'') IS NOT NULL
      AND translate(lower(regexp_replace(btrim(p.full_name),'[[:space:]]+',' ','g')),
        'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯё','абвгдеежзийклмнопрстуфхцчшщъыьэюяе')
        = translate(lower(regexp_replace(btrim(x->>'full_name'),'[[:space:]]+',' ','g')),
        'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯё','абвгдеежзийклмнопрстуфхцчшщъыьэюяе')),
    (SELECT count(*)::integer FROM public.profiles p WHERE p.organization_id = p_organization_id
      AND NULLIF(btrim(x->>'email'),'') IS NOT NULL AND lower(btrim(p.email)) = lower(btrim(x->>'email')))
  FROM jsonb_array_elements(p_rows) x;
END;
$function$;
REVOKE ALL ON FUNCTION public.student_import_identity_preflight(uuid,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_import_identity_preflight(uuid,jsonb,uuid) TO authenticated, service_role;
