-- Preserve the existing daily billing schedule and gateway anon token. The
-- business authorization is a separate random secret stored only in Vault.
-- No secret is printed or copied into a function definition / cron command.
BEGIN;
DO $preflight$
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.secrets') IS NULL
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Billing scheduler requires existing pg_cron and Vault';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname='check-subscription-expiry-daily')<>1 THEN
    RAISE EXCEPTION 'Expected exactly one existing daily billing job';
  END IF;
  IF EXISTS(SELECT 1 FROM vault.secrets WHERE name='sintagma_billing_cron_secret') THEN
    RAISE EXCEPTION 'Billing scheduler secret already exists; reconcile before deployment';
  END IF;
END $preflight$;

DO $secret$
BEGIN
  PERFORM vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
    'sintagma_billing_cron_secret','Authorization for the existing daily billing scheduler');
END $secret$;

CREATE FUNCTION public.verify_billing_cron_secret(p_secret text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted billing service required' USING ERRCODE='42501';
  END IF;
  IF p_secret IS NULL OR length(p_secret)<>64 THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='sintagma_billing_cron_secret' AND decrypted_secret=p_secret);
END $fn$;
REVOKE ALL ON FUNCTION public.verify_billing_cron_secret(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_billing_cron_secret(text) TO service_role;

DO $schedule$
DECLARE job_record record; expected_command text; new_command text;
BEGIN
  SELECT jobid,command INTO STRICT job_record FROM cron.job WHERE jobname='check-subscription-expiry-daily';
  -- Edit only the observed literal header expression. Any changed endpoint or
  -- cron command structure fails, leaving the prior job and Vault unchanged.
  IF job_record.command NOT LIKE '%https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/check-subscription-expiry%'
     OR job_record.command NOT LIKE '%net.http_post(%' THEN
    RAISE EXCEPTION 'Unexpected billing scheduler endpoint';
  END IF;
  expected_command:=substring(job_record.command FROM $re$headers\s*:=\s*'\{[^']*\}'::jsonb$re$);
  IF expected_command IS NULL OR expected_command NOT LIKE '%Authorization%' OR expected_command NOT LIKE '%Bearer ey%' THEN
    RAISE EXCEPTION 'Unexpected billing scheduler headers';
  END IF;
  new_command:=replace(job_record.command,expected_command,'headers := ('||substring(expected_command FROM $re$'\{[^']*\}'::jsonb$re$)
    ||' || jsonb_build_object(''x-billing-cron-secret'', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''sintagma_billing_cron_secret'')))');
  IF new_command NOT LIKE '%timeout_milliseconds%' THEN
    IF new_command NOT LIKE '%body:=''{}''::jsonb%' THEN RAISE EXCEPTION 'Unexpected billing scheduler body'; END IF;
    new_command:=replace(new_command,'body:=''{}''::jsonb','body:=''{}''::jsonb, timeout_milliseconds:=10000');
  END IF;
  IF new_command=job_record.command THEN RAISE EXCEPTION 'Billing scheduler command not updated'; END IF;
  PERFORM cron.alter_job(job_record.jobid,command:=new_command);
END $schedule$;
COMMIT;
