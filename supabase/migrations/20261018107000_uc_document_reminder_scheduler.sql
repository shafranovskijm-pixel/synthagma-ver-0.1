-- The legacy reminder job ignores document-update errors before emailing.
-- Pause only this exact job until a scoped, idempotent system workflow is ready.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $pause$
DECLARE j record; original jsonb;
BEGIN
 IF current_setting('transaction_isolation') NOT IN ('repeatable read','serializable')
   OR to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NULL
   OR NOT has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Document reminder pause requires supported cron API and repeatable-read transaction';
 END IF;
 IF (SELECT count(*) FROM cron.job WHERE jobname='process-document-expiry-reminders-daily')<>1 THEN
  RAISE EXCEPTION 'Expected exactly one legacy document reminder job';
 END IF;
 SELECT * INTO STRICT j FROM cron.job WHERE jobname='process-document-expiry-reminders-daily';
 IF NOT j.active OR j.username IS DISTINCT FROM current_user OR j.database IS DISTINCT FROM current_database()
   OR md5(j.command)<>'2d7b7e801492efbdf6bfac7f29731273'
   OR j.command NOT LIKE '%/functions/v1/process-document-expiry-reminders%' THEN
  RAISE EXCEPTION 'Unreviewed document reminder job; inspect safe metadata before release';
 END IF;
 original:=to_jsonb(j)-'active';
 PERFORM cron.alter_job(j.jobid,active:=false);
 SELECT * INTO STRICT j FROM cron.job WHERE jobname='process-document-expiry-reminders-daily';
 IF j.active OR (to_jsonb(j)-'active') IS DISTINCT FROM original THEN
  RAISE EXCEPTION 'Document reminder pause changed more than active';
 END IF;
END $pause$;
COMMIT;
