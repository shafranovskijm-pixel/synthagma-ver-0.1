// Source artifact authoring ONLY. No database, tests, build, network or Git writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const folder=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(folder,'../../../..');
const workspace=path.resolve(root,'../..');
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const hash=(s,kind='sha256')=>createHash(kind).update(s).digest('hex');
const json=p=>JSON.parse(read(p));
const emit=(p,v)=>fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');
const uc014=path.resolve(root,'../uc-final-assessment-20261020');
const oldHoldPath=path.join(workspace,'work/resume-20261020/uc014-implementation-authoring-hold.json');
const oldHold=json(oldHoldPath);
if(hash(fs.readFileSync(oldHoldPath))!=='6bde3a3d91d4375065565144317f33881c6e751f25108c401924c1494694e14f')throw Error('UC014 hold changed');
for(const f of oldHold.files)if(hash(fs.readFileSync(path.join(uc014,f.path)))!==f.rawSha256)throw Error('UC014 source drift: '+f.path);
const migrationPath='supabase/migrations/20261020150000_uc_server_custom_journals.sql';
const migration=read(path.join(root,migrationPath));
const oldSource=read(path.join(uc014,'supabase/migrations/20261020140000_uc_learning_outcome_foundation.sql'));
const prior=json(path.join(uc014,'supabase/tests/fixtures/uc-learning-outcomes-erasure-predecessors.json'));
const transform=(sig,src)=>{
 const needle=sig.includes('personal_row_counts')?' RETURN result;':sig.includes('snapshot')?" v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'":" IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0)";
 const replacement=sig.includes('personal_row_counts')?' result:=result||public.uc_learning_personal_counts(p_user_id);\n RETURN result;':sig.includes('snapshot')?" SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_learning_personal_counts(p_user_id))v;\n IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','learning_outcomes','label','Результаты обучения и решения: личные строки удаляются, атрибуция обезличивается','count',v_count,'action','delete_or_anonymize'));END IF;\n"+needle:' PERFORM public.uc_learning_erase_user(u);\n'+needle;
 if(src.split(needle).length!==2)throw Error('Ambiguous UC014 transform');
 return src.replace(needle,()=>replacement);
};
const erasure=Object.entries(prior.functions).map(([signature,variants])=>{
 const v=variants.find(x=>x.variant==='held116_not_released');
 if(!v||hash(v.definition,'md5')!==v.md5||transform(signature,v.definition)!==v.patchedDefinition||hash(v.patchedDefinition,'md5')!==v.patchedMd5)throw Error('UC014 actual predecessor not reproduced');
 if(!oldSource.includes(v.md5)||!migration.includes(v.patchedMd5))throw Error('Exact predecessor missing from source');
 return {signature:'public.'+signature,definition:v.patchedDefinition,definition_md5:v.patchedMd5,uc013_predecessor_md5:v.md5};
});
const capture=json(path.join(root,'docs/releases/sintagma-production/sgt-unlimited-perf-20261020/students-page-baseline-functions.json'));
const urgent=read(path.join(root,'supabase/migrations/20261020050000_students_page_scope_evaluation.sql'));
const urgentReplacement=urgent.match(/EXECUTE \$replacement\$\n([\s\S]*?)\$replacement\$;/)?.[1];
if(!urgentReplacement)throw Error('Actual urgent source missing');
const extract=(file,name)=>{const src=read(path.join(root,'supabase/migrations',file));const f=src.match(new RegExp('CREATE FUNCTION public\\.'+name+'\\([\\s\\S]*?\\$fn\\$;'));if(!f)throw Error('Missing actual helper '+name);return f[0];};
const fixture={status:'SOURCE_ONLY_CLOSED_AUTHORITY_FIXTURE_NOT_NATIVE_PROOF',uc014_hold_sha256:hash(fs.readFileSync(oldHoldPath)),uc014_31_raw_verified:true,
 source_boundaries:['Synthetic relations contain no real persons. Actual captured authority functions are installed in dependency order.','Only new UC015 helper erasure runs locally; full old account snapshot/jobs/UC013+UC014 chain remains a native acceptance gate.','No always-true authority or erasure stubs. Old erasure bodies are exact post-UC014 definitions; minimal unrelated job relation permits their creation but does not claim full job execution.'],
 authority:capture.functions.filter(f=>!f.signature.startsWith('get_organization_students_page(')),
 urgent_rpc:{definition:urgentReplacement,expected_definition_md5:'f38189a9960f714e43a3ebcbc60f336e'},urgent_migration:urgent,uc014_migration:oldSource,erasure,
 platform_action:extract('20261018105000_uc_document_action_permissions.sql','uc_platform_document_action_allowed'),
 program_hash:extract('20261018111000_uc_program_facts.sql','uc_program_hash'),
 uc014_table_ddl:[...oldSource.matchAll(/CREATE TABLE public\.uc_learning_\w+\([\s\S]*?\n\);/g)].map(x=>x[0]),
 uc014_private_functions:['uc_learning_error','uc_learning_personal_counts','uc_learning_erase_user'].map(name=>oldSource.match(new RegExp('CREATE FUNCTION public\\.'+name+'\\([\\s\\S]*?\\$fn\\$;'))?.[0])};
if(fixture.uc014_table_ddl.length!==6||fixture.uc014_private_functions.some(x=>!x))throw Error('Exact actual UC014 erasure closure absent');
emit(path.join(root,'supabase/tests/fixtures/uc-custom-journals-source-baseline.json'),fixture);
const tables=['uc_custom_journals','uc_custom_journal_schemas','uc_custom_journal_records','uc_custom_journal_history','uc_custom_journal_requests'];
const functions=[...migration.matchAll(/CREATE FUNCTION public\.(\w+)\(([^\n]*?)\)RETURNS (\w+) LANGUAGE (\w+)([^$]*?)AS \$fn\$([\s\S]*?)\$fn\$;/g)].map(([,name,args,result,lang,opts,body])=>({signature:'public.'+name+'('+args.split(',').filter(Boolean).map(a=>a.trim().replace(/\s+DEFAULT.*$/i,'').replace(/^\S+\s+/,'')).join(',')+')',name,result,argument_names:args.trim()?args.split(',').map(a=>a.trim().split(/\s/)[0]):null,defaults:args.includes(' DEFAULT ')?args.match(/ DEFAULT (true|false)/)?.[1]:null,language:lang,security_definer:opts.includes('SECURITY DEFINER'),volatility:opts.includes('IMMUTABLE')?'i':opts.includes('STABLE')?'s':'v',configuration:['search_path='+opts.match(/SET search_path=([a-z_,]+)/)[1].replaceAll(',',', ')],body_md5:hash(body,'md5')}));
if(functions.length!==22||new Set(functions.map(f=>f.signature)).size!==22)throw Error('Expected exact 22-function ABI, got '+functions.length);
const sourcePins={migration_sha256:hash(migration),migration_md5:hash(migration,'md5'),raw_migration_sha256:hash(fs.readFileSync(path.join(root,migrationPath)))};
const q=s=>"'"+s.replaceAll("'","''")+"'";
const payload=JSON.stringify({functions,erasure,tables,...sourcePins});
const literal='$uc015_migration$'+migration+'$uc015_migration$';
const commonGuard=`
CREATE TEMP TABLE uc015_old_ledger ON COMMIT DROP AS SELECT * FROM supabase_migrations.schema_migrations WHERE version<>'20261020150000';
CREATE TEMP TABLE uc015_old_functions ON COMMIT DROP AS SELECT p.oid,p.proowner,p.proacl,to_jsonb(p)-ARRAY['prosrc','probin'] metadata,CASE WHEN p.prokind='a'THEN NULL ELSE pg_get_functiondef(p.oid)END definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261020050000'AND name='students_page_scope_evaluation'AND cardinality(statements)=1 AND md5(statements[1])='52b7991123db54e5e6baa856fe5ebf98')OR md5(pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure))<>'f38189a9960f714e43a3ebcbc60f336e'THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_URGENT_RPC_CHANGED';END IF;
END;$guard$;
`;
const preserve=`
DO $preserved$ BEGIN
 IF EXISTS((SELECT to_jsonb(x) FROM uc015_old_ledger x EXCEPT SELECT to_jsonb(x)FROM supabase_migrations.schema_migrations x WHERE version<>'20261020150000')UNION ALL(SELECT to_jsonb(x)FROM supabase_migrations.schema_migrations x WHERE version<>'20261020150000'EXCEPT SELECT to_jsonb(x)FROM uc015_old_ledger x))THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_OLD_LEDGER_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM uc015_old_functions o LEFT JOIN pg_proc p ON p.oid=o.oid WHERE p.oid IS NULL OR p.proowner<>o.proowner OR p.proacl IS DISTINCT FROM o.proacl OR to_jsonb(p)-ARRAY['prosrc','probin'] IS DISTINCT FROM o.metadata OR(p.oid NOT IN('public.account_deletion_personal_row_counts(uuid)'::regprocedure,'public.account_deletion_snapshot(uuid)'::regprocedure,'public.account_deletion_erase_data(uuid,text)'::regprocedure)AND(CASE WHEN p.prokind='a'THEN NULL ELSE pg_get_functiondef(p.oid)END)IS DISTINCT FROM o.definition))THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_OLD_FUNCTION_CHANGED';END IF;
END;$preserved$;
`;
const functionFence=`
DO $fence$ DECLARE proof jsonb:=$uc015_proof$${payload}$uc015_proof$;f jsonb;fn_metadata record;t text;BEGIN
 IF(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'uc_custom_journal_%'OR p.proname IN('read_custom_journals','apply_custom_journal_action')))<>jsonb_array_length(proof->'functions')THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_ABI_CHANGED';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(proof->'functions')LOOP
  SELECT x.*,l.lanname INTO fn_metadata FROM pg_proc x JOIN pg_language l ON l.oid=x.prolang WHERE x.oid=to_regprocedure(f->>'signature');
  IF fn_metadata.oid IS NULL OR md5(fn_metadata.prosrc)<>f->>'body_md5'OR fn_metadata.prosecdef<>(f->>'security_definer')::boolean OR fn_metadata.provolatile::text<>f->>'volatility'OR fn_metadata.lanname<>f->>'language'OR to_jsonb(fn_metadata.proconfig)<>f->'configuration'OR fn_metadata.proowner<>(SELECT proowner FROM pg_proc WHERE oid='public.apply_custom_journal_action(uuid,bigint,uuid,jsonb)'::regprocedure)OR coalesce(to_jsonb(fn_metadata.proargnames),'null'::jsonb)IS DISTINCT FROM f->'argument_names'OR pg_get_expr(fn_metadata.proargdefaults,0)IS DISTINCT FROM f->>'defaults'OR format_type(fn_metadata.prorettype,NULL)<>f->>'result'OR fn_metadata.proretset OR fn_metadata.proisstrict OR fn_metadata.proleakproof OR fn_metadata.proparallel<>'u'OR fn_metadata.procost<>100 OR fn_metadata.prorows<>0 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_SOURCE_CHANGED';END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(fn_metadata.proacl,acldefault('f',fn_metadata.proowner)))a WHERE a.grantee<>fn_metadata.proowner AND NOT(f->>'name'IN('read_custom_journals','apply_custom_journal_action')AND a.grantee='authenticated'::regrole AND a.privilege_type='EXECUTE'AND NOT a.is_grantable))OR(f->>'name'IN('read_custom_journals','apply_custom_journal_action')AND NOT has_function_privilege('authenticated',fn_metadata.oid,'EXECUTE'))THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_ACL_CHANGED';END IF;
 END LOOP;
 FOR t IN SELECT jsonb_array_elements_text(proof->'tables')LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',t)::regclass AND relrowsecurity AND relowner=(SELECT proowner FROM pg_proc WHERE oid='public.apply_custom_journal_action(uuid,bigint,uuid,jsonb)'::regprocedure))OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.oid=format('public.%I',t)::regclass AND a.grantee<>c.relowner)OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=format('public.%I',t)::regclass)THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_TABLE_ACL_CHANGED';END IF;
  IF(SELECT count(*)FROM pg_trigger WHERE tgrelid=format('public.%I',t)::regclass AND NOT tgisinternal)<>1 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',t)::regclass AND NOT tgisinternal AND tgname='uc_custom_journal_private_history'AND tgfoid='public.uc_custom_journal_guard()'::regprocedure AND tgenabled='O'AND tgtype=27 AND tgnargs=0 AND tgqual IS NULL)THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_IMMUTABILITY_GUARD_CHANGED';END IF;
 END LOOP;
END;$fence$;
`;
const release=`-- PREPARED SOURCE ONLY. Requires coordinated native acceptance and fresh root ledger review.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='15s';\nLOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\n${commonGuard}
DO $release$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261020150000')OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261019120000')OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261020140000'AND md5(array_to_string(statements,E'\\n'))='e63e4166f77f1c355a3f37468df3dcd7')THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_RELEASE_DEPENDENCY';END IF;
 EXECUTE ${literal};
END;$release$;
${functionFence}
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261020150000','uc_server_custom_journals',ARRAY[${literal}]);
${preserve}COMMIT;\n`;
emit(path.join(folder,'release-atomic.sql'),release);
const eraseSig='public.account_deletion_erase_data(uuid,text)';
const restore=erasure.map(f=>{
 const needle=f.signature.includes('personal_row_counts')?' result:=result||public.uc_custom_journal_personal_counts(p_user_id);\n':f.signature.includes('snapshot')?" SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_custom_journal_personal_counts(p_user_id))v;\n IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','custom_journals','label','Собственные журналы: строки выбранного лица удаляются, авторские копии обезличиваются','count',v_count,'action','delete_or_anonymize'));END IF;\n":'\n PERFORM public.uc_custom_journal_erase_user(u);';
 const expected=f.signature===eraseSig?f.definition.replace(' PERFORM public.uc_learning_erase_user(u);',' PERFORM public.uc_learning_erase_user(u);'+needle):f.signature.includes('personal_row_counts')?f.definition.replace(' RETURN result;',needle+' RETURN result;'):f.definition.replace(" v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'",needle+" v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'");
 return {...f,post_definition:expected,post_definition_md5:hash(expected,'md5')};
});
emit(path.join(root,'supabase/tests/fixtures/uc-custom-journals-erasure-pins.json'),{status:'SOURCE_DERIVED_EXACT_POST014_116_ONLY',uc014_hold_sha256:fixture.uc014_hold_sha256,functions:restore});
const rollbackCommonGuard=commonGuard.replace("WHERE n.nspname='public';","WHERE n.nspname='public'AND NOT(p.proname LIKE 'uc_custom_journal_%'OR p.proname IN('read_custom_journals','apply_custom_journal_action'));");
if(rollbackCommonGuard===commonGuard)throw Error('Rollback old-catalog exclusion not applied');
const rollback=`-- PREPARED / NOT EXECUTED. Refuse any populated journal foundation.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='15s';\nLOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\nLOCK TABLE ${tables.map(t=>'public.'+t).join(',')} IN ACCESS EXCLUSIVE MODE;\n${rollbackCommonGuard}${functionFence}
DO $rollback$ DECLARE t text;f jsonb;proof jsonb:=$uc015_restore$${JSON.stringify(restore)}$uc015_restore$;n bigint;BEGIN
 FOREACH t IN ARRAY ARRAY[${tables.map(q).join(',')}]LOOP EXECUTE format('SELECT count(*)FROM public.%I',t)INTO n;IF n<>0 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_ROLLBACK_NONEMPTY';END IF;END LOOP;
 IF(SELECT count(*)FROM supabase_migrations.schema_migrations m WHERE m.version='20261020150000'AND to_jsonb(m)=jsonb_build_object('version','20261020150000','name','uc_server_custom_journals','statements',to_jsonb(ARRAY[${literal}]),'created_by',NULL,'idempotency_key',NULL,'rollback',NULL))<>1 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_ROLLBACK_LEDGER_CHANGED';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(proof)LOOP
  IF md5(pg_get_functiondef(to_regprocedure(f->>'signature')))IS DISTINCT FROM f->>'post_definition_md5'THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_ERASURE_SOURCE_CHANGED';END IF;
  EXECUTE f->>'definition';
  IF md5(pg_get_functiondef(to_regprocedure(f->>'signature')))IS DISTINCT FROM f->>'definition_md5'THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_ERASURE_RESTORE_FAILED';END IF;
 END LOOP;
END;$rollback$;
${tables.map(t=>`DROP TRIGGER uc_custom_journal_private_history ON public.${t};`).join('\n')}
${[...functions].reverse().map(f=>`DROP FUNCTION ${f.signature};`).join('\n')}
ALTER TABLE public.uc_custom_journals DROP CONSTRAINT uc_custom_journals_current_schema;
${[...tables].reverse().map(t=>`DROP TABLE public.${t};`).join('\n')}
DELETE FROM supabase_migrations.schema_migrations WHERE version='20261020150000';
${preserve}COMMIT;\n`;
emit(path.join(folder,'rollback-empty-foundation.sql'),rollback);
emit(path.join(folder,'preflight-readonly.sql'),`-- READ ONLY. Save complete result before any separately authorized release.\nSELECT jsonb_build_object('ledger_count',(SELECT count(*)FROM supabase_migrations.schema_migrations),'full_ledger_hash',(SELECT md5(coalesce(jsonb_agg(to_jsonb(m)ORDER BY version),'[]')::text)FROM supabase_migrations.schema_migrations m),'new_version_absent',NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261020150000'),'urgent_rpc_md5',md5(pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure)),'erasure',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'oid',p.oid,'owner',p.proowner,'acl',p.proacl,'definition_md5',md5(pg_get_functiondef(p.oid)))ORDER BY p.oid::regprocedure::text)FROM pg_proc p WHERE p.oid IN('public.account_deletion_personal_row_counts(uuid)'::regprocedure,'public.account_deletion_snapshot(uuid)'::regprocedure,'public.account_deletion_erase_data(uuid,text)'::regprocedure)))AS uc015_preflight;\n`);
emit(path.join(folder,'postcheck-readonly.sql'),`-- READ ONLY. Compare old_ledger_hash to saved preflight full_ledger_hash.\nSELECT jsonb_build_object('old_ledger_hash',(SELECT md5(coalesce(jsonb_agg(to_jsonb(m)ORDER BY version),'[]')::text)FROM supabase_migrations.schema_migrations m WHERE version<>'20261020150000'),'new_ledger',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'statement_count',cardinality(statements),'migration_md5',md5(statements[1])))FROM supabase_migrations.schema_migrations WHERE version='20261020150000'),'urgent_rpc_md5',md5(pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure)),'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',p.proowner,'acl',p.proacl,'security_definer',p.prosecdef,'configuration',p.proconfig,'body_md5',md5(p.prosrc))ORDER BY p.oid::regprocedure::text)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'uc_custom_journal_%'OR p.proname IN('read_custom_journals','apply_custom_journal_action'))),'erasure',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'oid',p.oid,'owner',p.proowner,'acl',p.proacl,'definition_md5',md5(pg_get_functiondef(p.oid)))ORDER BY p.oid::regprocedure::text)FROM pg_proc p WHERE p.oid IN('public.account_deletion_personal_row_counts(uuid)'::regprocedure,'public.account_deletion_snapshot(uuid)'::regprocedure,'public.account_deletion_erase_data(uuid,text)'::regprocedure)))AS uc015_postcheck;\n`);
emit(path.join(folder,'source-manifest.json'),{status:'SOURCE_AUTHORED_NOT_EXECUTED_RELEASE_HELD',base:'156283545206fd096f60f822ffee77f254ef283e',version:'20261020150000',migration:migrationPath,...sourcePins,new_tables:tables,new_functions:functions,erasure_predecessors:erasure.map(({definition,...v})=>v),erasure_targets:restore.map(({definition,post_definition,...v})=>v),urgent_rpc_definition_md5:'f38189a9960f714e43a3ebcbc60f336e',uc014_hold_sha256:fixture.uc014_hold_sha256,uc014_31_raw_verified:true,execution_count:0,release_sha256:hash(release),rollback_sha256:hash(rollback),privacy_boundary:'Exact declared subject/actor erasure. No claim to discover undeclared third-party PII in arbitrary free text. Unlinked records unsupported.',native_gates:['UC013 stable native26 and release','UC014 native acceptance and release','Actual PG17 transaction/locks/revocation/defaultACL/collision/rollback and full account erasure chain','Fresh full ledger + old-function catalog metadata; only intended row/3 erasure bodies may change','Synthetic two-employee/two-device browser acceptance; legacy unchanged'],not_claimed:['SQL or frontend tests executed','Native acceptance','Production release','Legal signature','Automatic PII discovery','Org-only unlinked journals']});
console.log(JSON.stringify({authored:true,functions:functions.length,predecessors:erasure.map(f=>({signature:f.signature,md5:f.definition_md5})),...sourcePins,execution:'source artifact writing only'}));
