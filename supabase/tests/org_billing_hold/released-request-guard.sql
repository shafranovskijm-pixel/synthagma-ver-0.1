-- Exact released PostgREST pre-request guard from production, MD5 e638ab601eaa8207eb577614bf7e262f.
CREATE OR REPLACE FUNCTION public.account_deletion_request_guard()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF NOT public.account_deletion_access_allowed() THEN
  RAISE EXCEPTION 'Account access revoked' USING ERRCODE='42501';
 END IF;
END;
$function$;
