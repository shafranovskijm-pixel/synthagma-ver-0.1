-- Driving-school account revocation fence; migration version 20261027010000.
-- Exact three existing helper definitions from the tested revision B.
-- New bounded guards require existing postgres-owned SECURITY DEFINER helpers with search_path=public and closed PUBLIC/anon/authenticated EXECUTE.
-- No grants are added. Execute the entire file atomically through migration tooling.
-- Do not replay a version already in the ledger. This file is not a production acceptance receipt.
DO $as_private_helper_guard_before$
DECLARE
  helper_signature text;
  helper_oid pg_catalog.oid;
BEGIN
  FOREACH helper_signature IN ARRAY ARRAY[
    'public.driving_can_manage(uuid)',
    'public.driving_membership(uuid)',
    'public.driving_assert_account(uuid,uuid,text)'
  ] LOOP
    helper_oid := pg_catalog.to_regprocedure(helper_signature);
    IF helper_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
      WHERE p.oid = helper_oid AND p.prokind = 'f' AND r.rolname = 'postgres'
        AND p.prosecdef
        AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public']::pg_catalog.text[]
    ) THEN
      RAISE EXCEPTION 'AS_EXISTING_PRIVATE_HELPER_REQUIRED' USING ERRCODE = '55000';
    END IF;
    IF pg_catalog.has_function_privilege('anon', helper_oid, 'EXECUTE') IS DISTINCT FROM false
      OR pg_catalog.has_function_privilege('authenticated', helper_oid, 'EXECUTE') IS DISTINCT FROM false
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p,
          LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
        WHERE p.oid = helper_oid AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      ) THEN
      RAISE EXCEPTION 'AS_PRIVATE_HELPER_EXECUTE_MUST_REMAIN_CLOSED' USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$as_private_helper_guard_before$;
CREATE OR REPLACE FUNCTION public.driving_can_manage(_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $function$
DECLARE actor uuid:=auth.uid();BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'DRIVING_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';
 END IF;
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR _organization_id IS NULL THEN RETURN false;END IF;
 -- Same subject fence as the existing account-deletion contract. Try-lock avoids a
 -- school-lock/account-lock cycle and asks the caller to retry instead of writing stale facts.
 IF NOT pg_try_advisory_xact_lock(hashtextextended(actor::text,42007))THEN
  RAISE EXCEPTION 'DRIVING_ACCOUNT_CONFLICT: повторите проверку доступа' USING ERRCODE='40001';END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=actor)THEN RETURN false;END IF;
 RETURN COALESCE(auth.uid()IS NOT NULL
  AND public.can_access_organization(_organization_id,NULL::text)
  AND(EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid()AND p.blocked_at IS NULL AND p.archived_at IS NULL)
   OR(public.has_role(auth.uid(),'admin'::public.app_role)AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid()))),false);
END;$function$;

CREATE OR REPLACE FUNCTION public.driving_membership(_organization_id uuid)
RETURNS TABLE(role public.driving_member_role,student_id uuid,instructor_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $function$
DECLARE actor uuid:=auth.uid();BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'DRIVING_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';
 END IF;
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR _organization_id IS NULL THEN RETURN;END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(actor::text,42007))THEN
  RAISE EXCEPTION 'DRIVING_ACCOUNT_CONFLICT: повторите проверку доступа' USING ERRCODE='40001';END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=actor)THEN RETURN;END IF;
 RETURN QUERY SELECT m.role,m.student_id,m.instructor_id FROM public.driving_memberships m
 JOIN public.profiles p ON p.user_id=m.user_id AND p.organization_id=m.organization_id
  AND p.blocked_at IS NULL AND p.archived_at IS NULL
 JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL
 WHERE m.user_id=auth.uid()AND m.organization_id=_organization_id AND(
  (m.role='student'AND EXISTS(SELECT 1 FROM public.driving_students s WHERE s.organization_id=m.organization_id
   AND s.id=m.student_id AND s.user_id=m.user_id AND s.active))
  OR(m.role='instructor'AND EXISTS(SELECT 1 FROM public.driving_instructors i WHERE i.organization_id=m.organization_id
   AND i.id=m.instructor_id AND i.user_id=m.user_id AND i.active)))
 ORDER BY CASE m.role WHEN'instructor'THEN 0 ELSE 1 END LIMIT 1;
END;$function$;

CREATE OR REPLACE FUNCTION public.driving_assert_account(_organization_id uuid,_user_id uuid,_email text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_email text;subject uuid;BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'DRIVING_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';
 END IF;
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL THEN
  RAISE EXCEPTION 'DRIVING_FORBIDDEN: необходим исходный авторизованный аккаунт' USING ERRCODE='42501';END IF;
 IF _organization_id IS NULL OR _user_id IS NULL THEN
  RAISE EXCEPTION 'DRIVING_FORBIDDEN: необходим действующий аккаунт школы' USING ERRCODE='42501';END IF;
 FOR subject IN SELECT DISTINCT x FROM unnest(ARRAY[auth.uid(),_user_id])x ORDER BY x LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(subject::text,42007))THEN
   RAISE EXCEPTION 'DRIVING_ACCOUNT_CONFLICT: повторите проверку доступа' USING ERRCODE='40001';END IF;
  IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=subject)THEN
   RAISE EXCEPTION 'DRIVING_FORBIDDEN: доступ аккаунта отозван' USING ERRCODE='42501';END IF;
 END LOOP;
 SELECT lower(btrim(u.email))INTO v_email FROM auth.users u
 WHERE u.id=_user_id AND u.email_confirmed_at IS NOT NULL AND nullif(btrim(u.email),'')IS NOT NULL FOR SHARE;
 IF NOT FOUND OR(_email IS NOT NULL AND v_email IS DISTINCT FROM lower(btrim(_email)))THEN
  RAISE EXCEPTION 'DRIVING_FORBIDDEN: нужен подтверждённый email приглашённого аккаунта' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.profiles p WHERE p.user_id=_user_id AND p.organization_id=_organization_id
  AND p.blocked_at IS NULL AND p.archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'DRIVING_FORBIDDEN: аккаунт не принадлежит этой школе или отключён' USING ERRCODE='42501';END IF;
END;$function$;

DO $as_private_helper_guard_after$
DECLARE
  helper_signature text;
  helper_oid pg_catalog.oid;
BEGIN
  FOREACH helper_signature IN ARRAY ARRAY[
    'public.driving_can_manage(uuid)',
    'public.driving_membership(uuid)',
    'public.driving_assert_account(uuid,uuid,text)'
  ] LOOP
    helper_oid := pg_catalog.to_regprocedure(helper_signature);
    IF helper_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
      WHERE p.oid = helper_oid AND p.prokind = 'f' AND r.rolname = 'postgres'
        AND p.prosecdef
        AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public']::pg_catalog.text[]
    ) THEN
      RAISE EXCEPTION 'AS_EXISTING_PRIVATE_HELPER_REQUIRED' USING ERRCODE = '55000';
    END IF;
    IF pg_catalog.has_function_privilege('anon', helper_oid, 'EXECUTE') IS DISTINCT FROM false
      OR pg_catalog.has_function_privilege('authenticated', helper_oid, 'EXECUTE') IS DISTINCT FROM false
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p,
          LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
        WHERE p.oid = helper_oid AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      ) THEN
      RAISE EXCEPTION 'AS_PRIVATE_HELPER_EXECUTE_MUST_REMAIN_CLOSED' USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$as_private_helper_guard_after$;
