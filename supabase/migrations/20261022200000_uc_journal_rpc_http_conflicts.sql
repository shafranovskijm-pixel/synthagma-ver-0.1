-- UC015 public HTTP boundary only. No table data or private-helper changes.
-- SQLSTATE40001 can make PostgREST retry indefinitely. PT409 returns HTTP409.
-- Full existing bodies stay nested and byte-identical, including their handlers.
DO $uc015_http_616$
DECLARE
 v_pin record;v_proc pg_proc;v_old text;v_new text;v_definition text;v_before jsonb;v_after jsonb;
 v_targets oid[]:=ARRAY['public.read_scoped_custom_journals(uuid,jsonb,jsonb)'::regprocedure::oid,'public.apply_scoped_custom_journal_action(uuid,jsonb,bigint,uuid,jsonb)'::regprocedure::oid];
BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>615 THEN RAISE EXCEPTION 'UC015_HTTP_UNREVIEWED_LEDGER';END IF;
 SELECT jsonb_build_object(
 'public_functions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg((to_jsonb(p)-'prosrc')||jsonb_build_object('prosrc',CASE WHEN p.oid=ANY(v_targets) THEN NULL ELSE p.prosrc END) ORDER BY p.oid)::text,''),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
 'public_function_count',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
 'public_relations',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid)::text,''),'UTF8')),'hex') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'public_columns',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum)::text,''),'UTF8')),'hex') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'public_policies',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,''),'UTF8')),'hex') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'public_triggers',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid)::text,''),'UTF8')),'hex') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'default_acl',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid)::text,''),'UTF8')),'hex') FROM pg_default_acl a),
 'roles',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid)::text,''),'UTF8')),'hex') FROM pg_roles r),
 'memberships',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.roleid,r.member,r.grantor)::text,''),'UTF8')),'hex') FROM pg_auth_members r)
) INTO v_before;
 FOR v_pin IN SELECT * FROM(VALUES
('public.read_scoped_custom_journals(uuid,jsonb,jsonb)','71ce0f205c9f56079698668b521301ea','4e1c61ac01788fbe552b9b6ca64869656baef93b4c5400963c469c13093456b5','70a68d6942b93148a5c4ae913c51e6c8','ab2a8dc6e4c5064cf081019fa4792dd5d9857b7036a2c32e4366911d1b9bf160'),
('public.apply_scoped_custom_journal_action(uuid,jsonb,bigint,uuid,jsonb)','e8a2cfcba38498f4c6f3c636c80958c8','684b3aa4115522dc7c40371d7805e0599a889a78d2284a4bc2892d8d9064f613','f699585b6b73874c27f582be328b769d','ab3bc223aa6010d37ef66b6f5015c83a55d4a5caed7a75c644c9227547a9e0b3')
 )pins(signature,old_md5,old_sha256,new_md5,new_sha256) LOOP
  SELECT p.* INTO v_proc FROM pg_proc p WHERE p.oid=to_regprocedure(v_pin.signature);
  IF v_proc.oid IS NULL OR md5(v_proc.prosrc)<>v_pin.old_md5
   OR encode(sha256(convert_to(v_proc.prosrc,'UTF8')),'hex')<>v_pin.old_sha256
   OR v_proc.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')
   OR NOT v_proc.prosecdef OR v_proc.provolatile<>'v' OR v_proc.prokind<>'f' OR v_proc.proretset
   OR v_proc.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql') OR v_proc.prorettype<>'jsonb'::regtype
   OR v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public','TimeZone=UTC']
  THEN RAISE EXCEPTION 'UC015_HTTP_UNREVIEWED_RPC %',v_pin.signature;END IF;
  v_old:=v_proc.prosrc;
  v_new:=E'\nBEGIN\n'||v_old||E'\nEXCEPTION WHEN serialization_failure THEN\n RAISE EXCEPTION USING ERRCODE=''PT409'',MESSAGE=''CUSTOM_JOURNAL_REVISION_CONFLICT'';\nEND;\n';
  IF md5(v_new)<>v_pin.new_md5 OR encode(sha256(convert_to(v_new,'UTF8')),'hex')<>v_pin.new_sha256 THEN RAISE EXCEPTION 'UC015_HTTP_WRAPPER_SOURCE_MISMATCH';END IF;
  v_definition:=pg_get_functiondef(v_proc.oid);
  IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN RAISE EXCEPTION 'UC015_HTTP_AMBIGUOUS_BODY';END IF;
  EXECUTE replace(v_definition,v_old,v_new);
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid=v_proc.oid)<>v_pin.new_md5 THEN RAISE EXCEPTION 'UC015_HTTP_REPLACEMENT_MISMATCH';END IF;
 END LOOP;
 SELECT jsonb_build_object(
 'public_functions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg((to_jsonb(p)-'prosrc')||jsonb_build_object('prosrc',CASE WHEN p.oid=ANY(v_targets) THEN NULL ELSE p.prosrc END) ORDER BY p.oid)::text,''),'UTF8')),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
 'public_function_count',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
 'public_relations',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid)::text,''),'UTF8')),'hex') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'public_columns',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum)::text,''),'UTF8')),'hex') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'public_policies',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,''),'UTF8')),'hex') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'public_triggers',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid)::text,''),'UTF8')),'hex') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'default_acl',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid)::text,''),'UTF8')),'hex') FROM pg_default_acl a),
 'roles',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid)::text,''),'UTF8')),'hex') FROM pg_roles r),
 'memberships',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.roleid,r.member,r.grantor)::text,''),'UTF8')),'hex') FROM pg_auth_members r)
) INTO v_after;
 IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'UC015_HTTP_METADATA_OR_PRIVATE_SOURCE_CHANGED';END IF;
END;$uc015_http_616$;
