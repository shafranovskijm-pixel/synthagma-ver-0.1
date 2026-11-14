-- Unknown change in the SECOND function tests whole-payload rollback after the
-- first known provider body would have been repaired. Not production data.
SET ROLE postgres;
DO $fixture$
DECLARE original text;definition text;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO original,definition FROM pg_proc WHERE oid='public.get_rtn_workspace(uuid)'::regprocedure;
 EXECUTE replace(definition,original,original||E'\n-- synthetic unapproved drift for atomic rollback verification\n');
END;$fixture$;
