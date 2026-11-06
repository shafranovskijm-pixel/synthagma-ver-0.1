-- Preserve the existing PostgREST fence; distinguish reversible billing holds
-- from privacy revocation before the role RPC is entered. No data changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;
CREATE TEMP TABLE billing_request_guard_before ON COMMIT DROP AS
 SELECT p.oid,p.proowner,p.proacl,p.proargtypes,p.proargnames,p.prorettype,p.provolatile,
 p.proisstrict,p.prosecdef,p.proconfig,p.prolang,p.proparallel,p.proleakproof
 FROM pg_proc p WHERE p.oid='public.account_deletion_request_guard()'::regprocedure;
DO $cas$ BEGIN
 IF md5(pg_get_functiondef('public.account_deletion_request_guard()'::regprocedure))
 IS DISTINCT FROM 'e638ab601eaa8207eb577614bf7e262f'
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.account_deletion_request_guard()'::regprocedure
   AND proowner='postgres'::regrole AND prosecdef)
 OR to_regprocedure('billing_access_private.actor_allowed(uuid)') IS NULL
 THEN RAISE EXCEPTION 'billing_request_guard_source_changed';END IF;
END;$cas$;
CREATE OR REPLACE FUNCTION public.account_deletion_request_guard()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 -- Privacy revocation retains its original response and always wins.
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Account access revoked' USING ERRCODE='42501';
 END IF;
 IF NOT public.account_deletion_access_allowed() THEN
  RAISE EXCEPTION 'organization_access_suspended' USING ERRCODE='42501';
 END IF;
END;
$function$;
DO $abi$ BEGIN
 IF EXISTS(SELECT 1 FROM billing_request_guard_before b JOIN pg_proc p USING(oid)
 WHERE (p.proowner,p.proacl,p.proargtypes,p.proargnames,p.prorettype,p.provolatile,
 p.proisstrict,p.prosecdef,p.proconfig,p.prolang,p.proparallel,p.proleakproof)
 IS DISTINCT FROM (b.proowner,b.proacl,b.proargtypes,b.proargnames,b.prorettype,b.provolatile,
 b.proisstrict,b.prosecdef,b.proconfig,b.prolang,b.proparallel,b.proleakproof))
 THEN RAISE EXCEPTION 'billing_request_guard_abi_changed';END IF;
END;$abi$;
COMMIT;
