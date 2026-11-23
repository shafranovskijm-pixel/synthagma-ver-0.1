const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),repo=path.join(root,'repo');
const version='20261123190000',name='uc_document_chain_draft_scope';
const sourcePath=path.join(repo,'supabase/migrations',`${version}_${name}.sql`);
const canonical=fs.readFileSync(sourcePath,'utf8');
const sha=crypto.createHash('sha256').update(canonical).digest('hex');
if(sha!=='95ffe446fde157e7ed7d3341a6a14e529d785e5b50ac42719852895b3a706272'||Buffer.byteLength(canonical)!==5850)throw Error('Exact reviewed 1900 source required');
const match=canonical.match(/^([\s\S]*?)BEGIN;\r?\n([\s\S]*)\r?\nCOMMIT;\s*$/);
if(!match)throw Error('Expected exact outer transaction boundaries');
const inner=match[2];
const prior='7a0a04e4587c1fda6172ef781910e140';
const post='343a7508d39857f94665cb8cca1c8092';
const target="'uc_document_chain_private.row_value(uuid,jsonb,uuid,uuid,boolean)'::regprocedure";
const ledger="(SELECT jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY version),''))) FROM supabase_migrations.schema_migrations t)";
const catalog=`(SELECT jsonb_build_object(
 'functions',(SELECT md5(coalesce(string_agg(md5((CASE WHEN p.oid=${target} THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text),'' ORDER BY p.oid),'')) FROM pg_proc p),
 'namespaces',(SELECT md5(coalesce(string_agg(md5(to_jsonb(n)::text),'' ORDER BY n.oid),'')) FROM pg_namespace n),
 'classes_security',(SELECT md5(coalesce(string_agg(md5(jsonb_build_array(c.oid,c.relname,c.relnamespace,c.relowner,c.relkind,c.relacl,c.relrowsecurity,c.relforcerowsecurity)::text),'' ORDER BY c.oid),'')) FROM pg_class c),
 'policies',(SELECT md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' ORDER BY p.oid),'')) FROM pg_policy p),
 'default_acl',(SELECT md5(coalesce(string_agg(md5(to_jsonb(d)::text),'' ORDER BY d.oid),'')) FROM pg_default_acl d),
 'role_membership',(SELECT md5(coalesce(string_agg(md5(to_jsonb(a)::text),'' ORDER BY a.roleid,a.member,a.grantor),'')) FROM pg_auth_members a)
))`;
const orgs="ARRAY['0e29e728-bcc5-46e6-a339-066fb1e9c726','04cc2cb4-c837-40ca-9767-6d6b95def7f5','f7701297-2c10-4f8e-8123-4016cee9984f','cdd87239-1b04-47c9-8cd6-7ad57af4c54b']::uuid[]";
const tables=['public.uc_automatic_admission_drafts','public.uc_document_registry_records','public.education_document_records','public.org_documents','public.org_document_versions','uc_individual_orders_private.orders'];
const scopes=tables.map(t=>[t,`SELECT to_jsonb(r)::text AS row_value FROM ${t} r WHERE r.organization_id=ANY(${orgs})`]);
scopes.push(['public.courses',`SELECT to_jsonb(r)::text AS row_value FROM public.courses r WHERE r.organization_id=ANY(${orgs})`]);
scopes.push(['public.enrollments',`SELECT to_jsonb(r)::text AS row_value FROM public.enrollments r JOIN public.courses c ON c.id=r.course_id WHERE c.organization_id=ANY(${orgs})`]);
const business=`(SELECT jsonb_agg(jsonb_build_object('table',s.t,'count',s.n,'hash',s.h) ORDER BY s.t) FROM (${scopes.map(([t,q])=>`SELECT '${t}' t,count(*) n,md5(coalesce(string_agg(md5(row_value),'' ORDER BY md5(row_value)),'')) h FROM (${q}) b`).join('\nUNION ALL\n')}) s)`;
function wrapper(mode,binding=null){
 const isInstall=mode==='INSTALL';
 return `-- Root-only NEW forward correction. Does not replay any installed migration.\nBEGIN ISOLATION LEVEL REPEATABLE READ;\nSET LOCAL search_path=pg_catalog,public;\nDO $scope_owner$\nDECLARE\n canonical constant text:=$scope_canonical$${canonical}$scope_canonical$;\n before_catalog jsonb; before_business jsonb; before_ledger jsonb; receipt jsonb;\n qualification constant jsonb:=$scope_binding$${JSON.stringify(binding)}$scope_binding$::jsonb;\nBEGIN\n PERFORM pg_advisory_xact_lock(23190000);\n IF current_user<>'postgres' OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=${target}) IS DISTINCT FROM '${prior}' THEN RAISE EXCEPTION 'UC_SCOPE_REQUIRE_UNINSTALLED_EXACT_CURRENT_SOURCE'; END IF;\n IF encode(sha256(convert_to(canonical,'UTF8')),'hex')<>'${sha}' THEN RAISE EXCEPTION 'UC_SCOPE_CANONICAL_BYTES';END IF;\n before_catalog:=${catalog};before_business:=${business};before_ledger:=${ledger};\n ${isInstall?`IF (qualification IS NOT NULL AND qualification<>'null'::jsonb AND qualification->>'kind'='UC_SCOPE_QUALIFIED_ROLLBACK' AND qualification->>'source_sha256'='${sha}' AND qualification->>'after_body_md5'='${post}' AND qualification->'forced_rollback'='true'::jsonb AND qualification->'old_source_restored'='true'::jsonb) IS DISTINCT FROM true OR qualification->'catalog_before' IS DISTINCT FROM before_catalog OR qualification->'business_before' IS DISTINCT FROM before_business OR qualification->'ledger_before' IS DISTINCT FROM before_ledger THEN RAISE EXCEPTION 'UC_SCOPE_ACTUAL_QUALIFICATION_BINDING_REQUIRED';END IF;`:''}\n ${isInstall?'':`BEGIN\n `}EXECUTE $scope_payload$${inner}$scope_payload$;\n IF ${catalog} IS DISTINCT FROM before_catalog OR ${business} IS DISTINCT FROM before_business OR ${ledger} IS DISTINCT FROM before_ledger THEN RAISE EXCEPTION 'UC_SCOPE_UNAUTHORIZED_CATALOG_BUSINESS_OR_LEDGER_CHANGE'; END IF;\n receipt:=jsonb_build_object('kind','${isInstall?'UC_SCOPE_ACTUAL_INSTALL':'UC_SCOPE_QUALIFIED_ROLLBACK'}','source_sha256','${sha}','source_bytes',octet_length(convert_to(canonical,'UTF8')),'catalog_before',before_catalog,'business_before',before_business,'ledger_before',before_ledger,'before_body_md5','${prior}','after_body_md5',(SELECT md5(prosrc) FROM pg_proc WHERE oid=${target}),'observed_at',clock_timestamp(),'no_business_rpcs_or_auth_claim_changes',true);\n ${isInstall?`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[canonical]);\n receipt:=receipt||jsonb_build_object('installed',true,'ledger_after',${ledger});`:`RAISE EXCEPTION 'UC_SCOPE_FORCE_REVIEWED_ROLLBACK' USING ERRCODE='PZ190';\n EXCEPTION WHEN SQLSTATE 'PZ190' THEN NULL;END;\n IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=${target}) IS DISTINCT FROM '${prior}' OR ${catalog} IS DISTINCT FROM before_catalog OR ${business} IS DISTINCT FROM before_business OR ${ledger} IS DISTINCT FROM before_ledger THEN RAISE EXCEPTION 'UC_SCOPE_FORCED_ROLLBACK_DID_NOT_RESTORE';END IF;\n receipt:=receipt||jsonb_build_object('forced_rollback',true,'old_source_restored',true);`}
 PERFORM set_config('uc.scope_owner_receipt',receipt::text,true);\nEND;$scope_owner$;\nSELECT current_setting('uc.scope_owner_receipt')::jsonb AS result;\nCOMMIT;\n`;
}
const qual=wrapper('QUALIFY');
fs.writeFileSync(path.join(__dirname,'OWNER_1900_FORCED_ROLLBACK_QUALIFIER.sql'),qual);
const bindingFile=process.argv[2];
const binding=bindingFile?JSON.parse(fs.readFileSync(path.resolve(bindingFile),'utf8')):null;
if(binding&&(binding.kind!=='UC_SCOPE_QUALIFIED_ROLLBACK'||binding.source_sha256!==sha||binding.after_body_md5!==post||binding.forced_rollback!==true||binding.old_source_restored!==true||!binding.catalog_before||!binding.business_before||!binding.ledger_before))throw Error('Actual exact forced-rollback qualification receipt required');
const installer=wrapper('INSTALL',binding);
fs.writeFileSync(path.join(__dirname,binding?'BOUND_OWNER_1900_INSTALL.sql':'OWNER_1900_UNBOUND_DO_NOT_EXECUTE.sql'),installer);
const oldLedger="(SELECT jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY version),''))) FROM supabase_migrations.schema_migrations t WHERE version<>'"+version+"')";
const readback=`BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,public;\nWITH expected AS(SELECT $scope_expected$${JSON.stringify(binding)}$scope_expected$::jsonb q),checks AS(SELECT jsonb_build_object(
 'binding_present',q IS NOT NULL AND q<>'null'::jsonb AND q->>'kind'='UC_SCOPE_QUALIFIED_ROLLBACK' AND q->>'source_sha256'='${sha}',
 'exact_target_body',(SELECT md5(prosrc) FROM pg_proc WHERE oid=${target})='${post}',
 'old_metadata_and_authority_exact',${catalog}=q->'catalog_before',
 'old_business_exact',${business}=q->'business_before',
 'old_ledger_exact',${oldLedger}=q->'ledger_before',
 'one_exact_new_ledger',(SELECT count(*)=1 AND bool_and(name='${name}' AND cardinality(statements)=1 AND octet_length(convert_to(statements[1],'UTF8'))=5850 AND encode(sha256(convert_to(statements[1],'UTF8')),'hex')='${sha}') FROM supabase_migrations.schema_migrations WHERE version='${version}')
 ) flags FROM expected) SELECT jsonb_build_object('observed_at',clock_timestamp(),'kind','UC_SCOPE_INDEPENDENT_READBACK','flags',flags,'accepted',(SELECT bool_and(coalesce(value='true'::jsonb,false)) FROM jsonb_each(flags)), 'source_sha256','${sha}','current_ledger',${ledger},'business',${business}) AS result FROM checks;\nCOMMIT;\n`;
fs.writeFileSync(path.join(__dirname,binding?'BOUND_OWNER_1900_READBACK.sql':'OWNER_1900_READBACK_UNBOUND.sql'),readback);
fs.writeFileSync(path.join(__dirname,'OWNER_WRAPPER_MANIFEST.json'),JSON.stringify({version,sourceSha256:sha,sourceBytes:Buffer.byteLength(canonical),qualifierSha256:crypto.createHash('sha256').update(qual).digest('hex'),installerSha256:crypto.createHash('sha256').update(installer).digest('hex'),bound:!!binding,purpose:'New narrow forward scope fix; old installed migrations immutable; actual native acceptance remains required'},null,2)+'\n');
console.log(JSON.stringify({sourceSha256:sha,sourceBytes:Buffer.byteLength(canonical),bound:!!binding}));
