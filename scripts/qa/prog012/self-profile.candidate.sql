-- Ordinary self-profile initialisation only. No existing account/data repair.
-- No Auth creation, role/staff/tenant grants or changes to publication guards.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $preflight$
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'SELF_PROFILE_TRUSTED_INSTALLER_REQUIRED';END IF;
 IF to_regprocedure('public.ensure_my_profile()') IS NOT NULL THEN
  RAISE EXCEPTION 'SELF_PROFILE_EXISTING_FUNCTION_REQUIRES_REVIEW';END IF;
 IF to_regclass('public.profiles') IS NULL OR to_regclass('auth.users') IS NULL
 OR to_regprocedure('public.account_deletion_access_allowed()') IS NULL THEN
  RAISE EXCEPTION 'SELF_PROFILE_CURRENT_ACCOUNT_SCHEMA_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass
  AND conname='profiles_user_id_key' AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (user_id)') THEN
  RAISE EXCEPTION 'SELF_PROFILE_UNIQUE_USER_REQUIRED';END IF;
 -- Do not widen the existing table INSERT boundary to add this one operation.
 IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.profiles'::regclass
  AND polpermissive AND polcmd IN('a','*')) THEN
  RAISE EXCEPTION 'SELF_PROFILE_INSERT_POLICY_REQUIRES_REVIEW';END IF;
END;$preflight$;

CREATE FUNCTION public.ensure_my_profile() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $function$
DECLARE v_user uuid:=auth.uid();v_email text;v_profile public.profiles;
 v_inserted uuid;v_created boolean:=false;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'SELF_PROFILE_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
  RAISE EXCEPTION 'SELF_PROFILE_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(v_user::text,42007)) THEN
  RAISE EXCEPTION 'SELF_PROFILE_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 -- Same account fence as deletion/profile guards. The Auth row SHARE lock also
 -- prevents a concurrent ban/delete update from passing this active-state read.
 SELECT email INTO v_email FROM auth.users WHERE id=v_user AND deleted_at IS NULL
  AND(banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE NOWAIT;
 IF NOT FOUND OR NOT public.account_deletion_access_allowed() THEN
  RAISE EXCEPTION 'SELF_PROFILE_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO v_profile FROM public.profiles WHERE user_id=v_user FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF v_profile.blocked_at IS NOT NULL OR v_profile.archived_at IS NOT NULL THEN
   RAISE EXCEPTION 'SELF_PROFILE_ACCOUNT_UNAVAILABLE' USING ERRCODE='42501';END IF;
  RETURN jsonb_build_object('schema_version',1,'id',v_profile.id,'user_id',v_user,'created',false);
 END IF;
 -- Never call handle_new_user: its student-role insert is not self repair.
 -- Existing profile INSERT triggers remain enabled, including the normal
 -- idempotent first_step achievement. No association/credential is inferred.
 INSERT INTO public.profiles(user_id,email,full_name,organization_id,company_id,
  student_group_id,generated_password,login,blocked_at,archived_at,blocked_by,blocked_reason)
 VALUES(v_user,v_email,'',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)
 ON CONFLICT(user_id) DO NOTHING RETURNING id INTO v_inserted;
 v_created:=FOUND;
 SELECT * INTO v_profile FROM public.profiles WHERE user_id=v_user FOR UPDATE NOWAIT;
 IF NOT FOUND OR v_profile.user_id IS DISTINCT FROM v_user
 OR v_profile.blocked_at IS NOT NULL OR v_profile.archived_at IS NOT NULL THEN
  RAISE EXCEPTION 'SELF_PROFILE_ACCOUNT_UNAVAILABLE' USING ERRCODE='42501';END IF;
 IF v_created AND(v_profile.id IS DISTINCT FROM v_inserted
  OR v_profile.organization_id IS NOT NULL OR v_profile.company_id IS NOT NULL
  OR v_profile.student_group_id IS NOT NULL OR v_profile.generated_password IS NOT NULL
  OR v_profile.login IS NOT NULL) THEN
  RAISE EXCEPTION 'SELF_PROFILE_NEUTRAL_INITIALISATION_REQUIRED' USING ERRCODE='42501';END IF;
 IF auth.uid() IS DISTINCT FROM v_user OR auth.role() IS DISTINCT FROM 'authenticated'
 OR NOT public.account_deletion_access_allowed() OR NOT EXISTS(SELECT 1 FROM auth.users
  WHERE id=v_user AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<=clock_timestamp())) THEN
  RAISE EXCEPTION 'SELF_PROFILE_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('schema_version',1,'id',v_profile.id,'user_id',v_user,'created',v_created);
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'SELF_PROFILE_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';
END;$function$;

-- Remove default EXECUTE grants on this new function only, then expose only
-- the authenticated self operation. Owner authority remains unchanged.
DO $acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p
 CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
 WHERE p.oid='public.ensure_my_profile()'::regprocedure AND a.grantee<>p.proowner LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM '
   ||CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END;$acl$;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;
COMMIT;
