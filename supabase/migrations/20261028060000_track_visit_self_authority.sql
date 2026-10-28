-- SOURCE CANDIDATE ONLY; not parsed/applied. Only the two approved function contracts change.
-- Metadata pins are from2026-10-28; fail closed on any drift. Run through the existing owner context.
-- Transaction advisory lock coordinates cooperating installers; root must exclude concurrent target DDL.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $visit_guard$
DECLARE r record;v_acl text;v_callers text;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION 'TRACKVISIT_MIGRATION_REQUIRES_EXISTING_OWNER_CONTEXT' USING ERRCODE='42501';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('sintagma.trackvisit.self-authority.v2.20261028',0)) THEN RAISE EXCEPTION 'TRACKVISIT_MIGRATION_BUSY' USING ERRCODE='55P03';END IF;
 IF (SELECT count(*) FROM pg_namespace WHERE nspname IN('public','auth'))<>2 OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname IN('public','auth') AND (has_schema_privilege('anon',n.oid,'CREATE') OR has_schema_privilege('authenticated',n.oid,'CREATE'))) THEN RAISE EXCEPTION 'TRACKVISIT_UNTRUSTED_SCHEMA_DRIFT';END IF;
 FOR r IN SELECT v.signature,v.def_md5,v.body_md5,v.acl_sha,p.oid,p.proowner,p.prosecdef,p.proconfig,p.prosrc FROM(VALUES
 ('public.track_user_visit(uuid)','af204482571769d051962bc53c38b664','3b5529c0b6d8ab4cfdc72297d4949697','b931c391c12aaddb757222cf6c1fea48bf5c304fa7ca0b0f6d7a496cb67a228e'),
 ('public.award_achievement(uuid,text)','80bf1ad72be1413dfdcdfacd6704be7f','58cd245a14d217d27937e6f6efb232cf','b931c391c12aaddb757222cf6c1fea48bf5c304fa7ca0b0f6d7a496cb67a228e')
 )v(signature,def_md5,body_md5,acl_sha) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(v.signature) LOOP
 IF r.oid IS NULL OR pg_get_userbyid(r.proowner)::text IS DISTINCT FROM 'postgres' OR r.prosecdef IS DISTINCT FROM true OR r.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR md5(pg_get_functiondef(r.oid)) IS DISTINCT FROM r.def_md5 OR md5(r.prosrc) IS DISTINCT FROM r.body_md5 THEN RAISE EXCEPTION 'TRACKVISIT_BEFORE_FUNCTION_PREIMAGE_DRIFT:%',r.signature;END IF;
 SELECT encode(sha256(convert_to(coalesce(jsonb_agg(
 jsonb_build_object('grantee',a.grantee,'grantor',a.grantor,'privilege_type',a.privilege_type,'is_grantable',a.is_grantable)
 ORDER BY a.grantee COLLATE "C",a.grantor COLLATE "C",a.privilege_type,a.is_grantable),'[]'::jsonb)::text,'UTF8')),'hex')
 INTO v_acl FROM(
 SELECT CASE WHEN e.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee)::text END AS grantee,
 pg_get_userbyid(e.grantor)::text AS grantor,e.privilege_type,e.is_grantable
 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))e WHERE p.oid=r.oid
 )a;
 IF v_acl IS DISTINCT FROM r.acl_sha THEN RAISE EXCEPTION 'TRACKVISIT_BEFORE_ACL_DRIFT:%',r.signature;END IF;
 IF has_function_privilege('anon',r.oid,'EXECUTE') IS DISTINCT FROM true OR has_function_privilege('authenticated',r.oid,'EXECUTE') IS DISTINCT FROM true OR has_function_privilege('service_role',r.oid,'EXECUTE') IS DISTINCT FROM true OR has_function_privilege('postgres',r.oid,'EXECUTE') IS DISTINCT FROM true THEN RAISE EXCEPTION 'TRACKVISIT_BEFORE_EFFECTIVE_PRIVILEGE_DRIFT:%',r.signature;END IF;
 END LOOP;
 SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.signature COLLATE "C"),'[]'::jsonb)::text,'UTF8')),'hex')
 INTO v_callers FROM(
 SELECT format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) AS signature,
 pg_get_function_result(p.oid) AS return_type,pg_get_userbyid(p.proowner)::text AS owner,p.prosecdef,
 CASE WHEN p.proname='track_user_visit' THEN NULL ELSE encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') END AS unchanged_trigger_body_sha256,
 coalesce((SELECT jsonb_agg(jsonb_build_object('relation',format('%I.%I',nr.nspname,tb.relname),'name',t.tgname,'enabled',t.tgenabled,'type',t.tgtype) ORDER BY nr.nspname,tb.relname,t.tgname)
 FROM pg_trigger t JOIN pg_class tb ON tb.oid=t.tgrelid JOIN pg_namespace nr ON nr.oid=tb.relnamespace WHERE t.tgfoid=p.oid),'[]'::jsonb) AS triggers
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname<>'award_achievement' AND p.prosrc ILIKE '%award_achievement%'
 )c;
 IF v_callers IS DISTINCT FROM 'b0b55142239231c84b6018953771f3f5f383a1ae426c1696e24b21bfc6f4508c' THEN RAISE EXCEPTION 'TRACKVISIT_TRUSTED_CALLER_DRIFT';END IF;
END;$visit_guard$;

CREATE OR REPLACE FUNCTION public.track_user_visit(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_last_visit TIMESTAMP WITH TIME ZONE;
  v_days_away INTEGER;
BEGIN
  -- Telemetry is an authenticated self action, including for privileged callers.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'TRACK_VISIT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  v_actor := auth.uid();
  IF v_actor IS NULL OR p_user_id IS NULL OR p_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'TRACK_VISIT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Get last visit time
  SELECT last_visit_at INTO v_last_visit
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- Calculate days since last visit
  IF v_last_visit IS NOT NULL THEN
    v_days_away := EXTRACT(DAY FROM (now() - v_last_visit));
    
    -- Award return achievements based on days away
    IF v_days_away >= 90 THEN
      PERFORM award_achievement(p_user_id, 'phoenix');
      PERFORM award_achievement(p_user_id, 'comeback_king');
      PERFORM award_achievement(p_user_id, 'long_break');
      PERFORM award_achievement(p_user_id, 'welcome_back');
    ELSIF v_days_away >= 30 THEN
      PERFORM award_achievement(p_user_id, 'comeback_king');
      PERFORM award_achievement(p_user_id, 'long_break');
      PERFORM award_achievement(p_user_id, 'welcome_back');
    ELSIF v_days_away >= 7 THEN
      PERFORM award_achievement(p_user_id, 'long_break');
      PERFORM award_achievement(p_user_id, 'welcome_back');
    ELSIF v_days_away >= 3 THEN
      PERFORM award_achievement(p_user_id, 'welcome_back');
    END IF;
  END IF;
  
  -- Update last visit time
  UPDATE profiles
  SET last_visit_at = now()
  WHERE user_id = p_user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.track_user_visit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.track_user_visit(uuid) TO authenticated;

ALTER FUNCTION public.award_achievement(uuid,text) SET search_path TO pg_catalog, public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.award_achievement(uuid,text) FROM PUBLIC, anon, authenticated;

DO $visit_guard$
DECLARE r record;v_acl text;v_callers text;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION 'TRACKVISIT_MIGRATION_REQUIRES_EXISTING_OWNER_CONTEXT' USING ERRCODE='42501';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('sintagma.trackvisit.self-authority.v2.20261028',0)) THEN RAISE EXCEPTION 'TRACKVISIT_MIGRATION_BUSY' USING ERRCODE='55P03';END IF;
 IF (SELECT count(*) FROM pg_namespace WHERE nspname IN('public','auth'))<>2 OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname IN('public','auth') AND (has_schema_privilege('anon',n.oid,'CREATE') OR has_schema_privilege('authenticated',n.oid,'CREATE'))) THEN RAISE EXCEPTION 'TRACKVISIT_UNTRUSTED_SCHEMA_DRIFT';END IF;
 FOR r IN SELECT v.signature,v.def_md5,v.body_md5,v.acl_sha,p.oid,p.proowner,p.prosecdef,p.proconfig,p.prosrc FROM(VALUES
 ('public.track_user_visit(uuid)','b5c90d5d9a994bb68d90fad3081da105','ffe63a76e978ceeaabe8294040b59a69','cdc3f6653d9bb2e8c07001d492f6f3ec2572649286395c2667d36b4323f237d5'),
 ('public.award_achievement(uuid,text)','a23596f37efc3fa577bb6ba91bcfad88','58cd245a14d217d27937e6f6efb232cf','12000884dd900e3ea5678d1f93e1c447047220ebb8fa67ce78e5aa5d28ae18e0')
 )v(signature,def_md5,body_md5,acl_sha) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(v.signature) LOOP
 IF r.oid IS NULL OR pg_get_userbyid(r.proowner)::text IS DISTINCT FROM 'postgres' OR r.prosecdef IS DISTINCT FROM true OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp'] OR md5(pg_get_functiondef(r.oid)) IS DISTINCT FROM r.def_md5 OR md5(r.prosrc) IS DISTINCT FROM r.body_md5 THEN RAISE EXCEPTION 'TRACKVISIT_AFTER_FUNCTION_PREIMAGE_DRIFT:%',r.signature;END IF;
 SELECT encode(sha256(convert_to(coalesce(jsonb_agg(
 jsonb_build_object('grantee',a.grantee,'grantor',a.grantor,'privilege_type',a.privilege_type,'is_grantable',a.is_grantable)
 ORDER BY a.grantee COLLATE "C",a.grantor COLLATE "C",a.privilege_type,a.is_grantable),'[]'::jsonb)::text,'UTF8')),'hex')
 INTO v_acl FROM(
 SELECT CASE WHEN e.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee)::text END AS grantee,
 pg_get_userbyid(e.grantor)::text AS grantor,e.privilege_type,e.is_grantable
 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))e WHERE p.oid=r.oid
 )a;
 IF v_acl IS DISTINCT FROM r.acl_sha THEN RAISE EXCEPTION 'TRACKVISIT_AFTER_ACL_DRIFT:%',r.signature;END IF;
 IF has_function_privilege('anon',r.oid,'EXECUTE') IS DISTINCT FROM false OR has_function_privilege('authenticated',r.oid,'EXECUTE') IS DISTINCT FROM (r.signature='public.track_user_visit(uuid)') OR has_function_privilege('service_role',r.oid,'EXECUTE') IS DISTINCT FROM true OR has_function_privilege('postgres',r.oid,'EXECUTE') IS DISTINCT FROM true THEN RAISE EXCEPTION 'TRACKVISIT_AFTER_EFFECTIVE_PRIVILEGE_DRIFT:%',r.signature;END IF;
 END LOOP;
 SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.signature COLLATE "C"),'[]'::jsonb)::text,'UTF8')),'hex')
 INTO v_callers FROM(
 SELECT format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) AS signature,
 pg_get_function_result(p.oid) AS return_type,pg_get_userbyid(p.proowner)::text AS owner,p.prosecdef,
 CASE WHEN p.proname='track_user_visit' THEN NULL ELSE encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') END AS unchanged_trigger_body_sha256,
 coalesce((SELECT jsonb_agg(jsonb_build_object('relation',format('%I.%I',nr.nspname,tb.relname),'name',t.tgname,'enabled',t.tgenabled,'type',t.tgtype) ORDER BY nr.nspname,tb.relname,t.tgname)
 FROM pg_trigger t JOIN pg_class tb ON tb.oid=t.tgrelid JOIN pg_namespace nr ON nr.oid=tb.relnamespace WHERE t.tgfoid=p.oid),'[]'::jsonb) AS triggers
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname<>'award_achievement' AND p.prosrc ILIKE '%award_achievement%'
 )c;
 IF v_callers IS DISTINCT FROM 'b0b55142239231c84b6018953771f3f5f383a1ae426c1696e24b21bfc6f4508c' THEN RAISE EXCEPTION 'TRACKVISIT_TRUSTED_CALLER_DRIFT';END IF;
END;$visit_guard$;
DO $done$ BEGIN RAISE NOTICE 'TRACKVISIT_V2_POSTFLIGHT_OK';END;$done$;
COMMIT;
