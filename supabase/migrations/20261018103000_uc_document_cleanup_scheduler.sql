-- Pause only the legacy anonymous cleanup job. No document or object is deleted.
-- Retention may resume through a separately reviewed authenticated scheduler.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $pause$
DECLARE j record; preserved jsonb;
BEGIN
 IF current_setting('transaction_isolation') NOT IN('repeatable read','serializable')
   OR to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NULL
   OR NOT has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Cleanup pause requires supported cron API and repeatable-read transaction';
 END IF;
 IF (SELECT count(*) FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily')<>1 THEN
  RAISE EXCEPTION 'Expected exactly one legacy cleanup job';
 END IF;
 SELECT * INTO STRICT j FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily';
 IF NOT j.active OR j.username IS DISTINCT FROM current_user OR j.database IS DISTINCT FROM current_database()
   OR md5(j.command)<>'954edfdd26f6b685ed3d0977f26bf5e7'
   OR j.command NOT LIKE '%/functions/v1/purge-recycle-bin-storage%'
   OR j.command !~* 'authorization' OR j.command !~* 'bearer[[:space:]]+eyJ' THEN
  RAISE EXCEPTION 'Unreviewed legacy cleanup schedule; inspect safe metadata before release';
 END IF;
 preserved:=to_jsonb(j)-'active';
 -- Hosted pg_cron exposes this API; never grant or directly UPDATE cron.job.
 PERFORM cron.alter_job(j.jobid,active:=false);
 SELECT * INTO STRICT j FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily';
 IF j.active OR (to_jsonb(j)-'active') IS DISTINCT FROM preserved THEN
  RAISE EXCEPTION 'Cleanup pause changed more than active';
 END IF;
END $pause$;
COMMIT;
