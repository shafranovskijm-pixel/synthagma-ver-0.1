-- UC015 shared privacy fence. Only ordinary person42007 lock mode changes.
-- Deletion/erasure retain exclusive42007; org/group/request and journal locks stay intact.
-- Ledger616 precondition belongs to reviewed production wrappers, not this runtime patch.
DO $uc015_shared_617$
DECLARE
 v_proc pg_proc;v_old text;v_new text;v_definition text;v_before jsonb;v_after jsonb;
 v_targets oid[]:=ARRAY['public.uc_scoped_journal_fence(uuid,uuid,uuid[],uuid)'::regprocedure::oid];
BEGIN
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
 SELECT p.* INTO v_proc FROM pg_proc p WHERE p.oid=v_targets[1];
 IF v_proc.oid IS NULL OR md5(v_proc.prosrc)<>'be026a51877fe22530c9f04180599ab0'
  OR encode(sha256(convert_to(v_proc.prosrc,'UTF8')),'hex')<>'d63d70cf5e5325ec40e72b308c8f51b81b0354525024465680b173477abecb14'
  OR v_proc.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')
  OR NOT v_proc.prosecdef OR v_proc.provolatile<>'v' OR v_proc.prokind<>'f' OR v_proc.proretset
  OR v_proc.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql') OR v_proc.prorettype<>'void'::regtype
  OR v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']
 THEN RAISE EXCEPTION 'UC015_SHARED_UNREVIEWED_FENCE';END IF;
 v_old:=v_proc.prosrc;
 IF length(v_old)-length(replace(v_old,'pg_try_advisory_xact_lock(hashtextextended(v_person::text,42007))',''))<>length('pg_try_advisory_xact_lock(hashtextextended(v_person::text,42007))') THEN RAISE EXCEPTION 'UC015_SHARED_AMBIGUOUS_LOCK';END IF;
 v_new:=replace(v_old,'pg_try_advisory_xact_lock(hashtextextended(v_person::text,42007))','pg_try_advisory_xact_lock_shared(hashtextextended(v_person::text,42007))');
 IF md5(v_new)<>'48523eaff9abe6fce1d13028874caf81' OR encode(sha256(convert_to(v_new,'UTF8')),'hex')<>'531c82eecc6906f47d22f8c275e13ee2ac3930c543bbab173fc1ac5692084369' THEN RAISE EXCEPTION 'UC015_SHARED_SOURCE_MISMATCH';END IF;
 v_definition:=pg_get_functiondef(v_proc.oid);
 IF length(v_definition)-length(replace(v_definition,v_old,''))<>length(v_old) THEN RAISE EXCEPTION 'UC015_SHARED_AMBIGUOUS_BODY';END IF;
 EXECUTE replace(v_definition,v_old,v_new);
 IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid=v_proc.oid)<>'48523eaff9abe6fce1d13028874caf81' THEN RAISE EXCEPTION 'UC015_SHARED_REPLACEMENT_MISMATCH';END IF;
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
 IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'UC015_SHARED_METADATA_OR_OTHER_SOURCE_CHANGED';END IF;
END;$uc015_shared_617$;
