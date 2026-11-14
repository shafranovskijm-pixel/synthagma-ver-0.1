-- Dedicated RTN queue drain. No billing/cleanup schedule or old secret changes.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $preflight$ BEGIN
 IF to_regprocedure('cron.schedule(text,text,text)') IS NULL
 OR to_regprocedure('vault.create_secret(text,text,text,uuid)') IS NULL
 OR to_regclass('vault.decrypted_secrets') IS NULL
 OR to_regprocedure('public.enqueue_due_rtn_checks()') IS NULL
 OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
  RAISE EXCEPTION 'RTN scheduler requires existing supported cron, Vault, pg_net and worker schema';
 END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='rtn-official-source-check')
 OR EXISTS(SELECT 1 FROM vault.secrets WHERE name='sintagma_rtn_cron_secret') THEN
  RAISE EXCEPTION 'RTN scheduler already exists: reconcile instead of duplicating';
 END IF;
END;$preflight$;

DO $secret$ BEGIN
 PERFORM vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
  'sintagma_rtn_cron_secret','RTN source queue authorization; separate from billing and user sessions');
END;$secret$;

CREATE FUNCTION public.verify_rtn_cron_secret(p_secret text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'rtn_service_required' USING ERRCODE='42501';END IF;
 IF p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='sintagma_rtn_cron_secret' AND decrypted_secret=p_secret);
END;$fn$;
DO $acl$ DECLARE f record;g record;BEGIN
 SELECT p.oid,p.proowner,p.oid::regprocedure signature INTO STRICT f FROM pg_proc p WHERE p.oid='public.verify_rtn_cron_secret(text)'::regprocedure;
 FOR g IN SELECT DISTINCT grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner))) WHERE grantee<>f.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
 END LOOP;
END;$acl$;
GRANT EXECUTE ON FUNCTION public.verify_rtn_cron_secret(text) TO service_role;

-- The queue, rather than cron frequency, enforces daily checks / weekly full
-- reconciliation. Frequent bounded drains also recover expired worker leases.
DO $schedule$ BEGIN
 PERFORM cron.schedule('rtn-official-source-check','*/15 * * * *', $command$
 SELECT net.http_post(
  url:='https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/rtn-source-check',
  headers:=jsonb_build_object('Content-Type','application/json','x-rtn-cron-secret',
   (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='sintagma_rtn_cron_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=100000);
 $command$);
END;$schedule$;
COMMIT;
