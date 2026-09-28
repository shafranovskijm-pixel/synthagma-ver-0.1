// Local, in-memory PostgreSQL only. Generates and validates the scoped release
// package from the unchanged migration and existing synthetic fixture.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH || 'D:/Codex/workspaces/2026-09-28/new-chat/work/crm-lovable-documents-api/node_modules/@electric-sql/pglite/dist/index.js').href);
const read = name => readFile(path.join(repo, name), 'utf8');
const save = (name, text) => writeFile(path.join(here, name), text);
const hash = (algorithm, value) => createHash(algorithm).update(value).digest('hex');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const lf = value => value.replaceAll('\r\n', '\n');
const migrationName = '20260929120000_final_test_photo.sql';
const migrationBytes = await readFile(path.join(repo, 'supabase/migrations', migrationName));
const source = migrationBytes.toString('utf8');
const sourceMd5 = hash('md5', lf(source));
const sourceSha256 = hash('sha256', migrationBytes);
const extract = (text, expression) => { const value = text.match(expression)?.[0]; if (!value) throw new Error('Fixture source not found'); return value; };
const harness = await read('scripts/test-final-test-photo.mjs');
const setup = harness.split('try {')[1]?.split("  await db.exec(await read('supabase/migrations/20260929120000_final_test_photo.sql'));")[0];
if (!setup) throw new Error('Known synthetic fixture boundary changed');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
async function fixture() {
  const db = new PGlite();
  await new AsyncFunction('db', 'read', 'extract', setup)(db, read, extract);
  await db.exec(`CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text);
    INSERT INTO supabase_migrations.schema_migrations VALUES ('20260907120000',ARRAY['fixture'],'test_attempt_sessions'),('20260907120001',ARRAY['fixture'],'course_manual_credits');`);
  return db;
}
const norm = expression => `replace(${expression},chr(13)||chr(10),chr(10))`;
const signatures = [
  'public._final_test_photo_required(uuid)', 'public.can_upload_final_test_photo(text)',
  'public.can_read_final_test_photo(text)', 'public._final_test_photo_object_valid(uuid)',
  'public.prepare_final_test_photo(uuid,uuid)', 'public.complete_final_test_photo(uuid)',
  'public.get_test_attempt_photo(uuid)', 'public.start_test_attempt(uuid,uuid)',
  'public.submit_test_attempt(uuid,jsonb)', 'public.get_student_test_state(uuid)'];
const replaced = signatures.slice(-3);
const dependencies = ['auth.uid()', 'public.can_access_course_as_learner(uuid)', 'public.can_access_lesson(uuid,text)',
 'public._assert_test_learner_access(uuid)', 'public._test_manual_credit(uuid)', 'public._test_attempt_limits(uuid,uuid)',
 'public._test_session_payload(uuid)', 'public._test_grade_payload(uuid)', 'public._test_public_questions(jsonb,boolean)',
 'public._test_normalize_options(jsonb,integer)'];
const funcsQuery = wanted => `SELECT p.oid::regprocedure::text AS signature, md5(${norm('p.prosrc')}) AS source_md5,
  p.prosecdef, p.provolatile, p.proconfig, pg_get_function_result(p.oid) AS result_type,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
  FROM pg_proc p WHERE p.oid IN (${wanted.map(s=>`to_regprocedure(${quote(s)})`).join(',')}) ORDER BY signature`;
const db = await fixture();
let assertions = 0;
const assert = (condition, message) => { if (!condition) throw new Error(message); assertions++; };
try {
  const previous = (await db.query(funcsQuery(replaced))).rows;
  assert(previous.length === 3, 'Three baseline RPCs must exist');
  const colMap = {
   'public.courses':['id','organization_id','is_published'],
   'public.lessons':['id','course_id','module_id','type','order_index','test_questions_to_show','test_passing_score','test_show_answers'],
   'public.course_modules':['id','course_id','order_index'],
   'public.profiles':['user_id','blocked_at'],
   'public.enrollments':['id','user_id','course_id'],
   'public.test_attempt_sessions':['id','user_id','lesson_id','request_id','status','started_at','submitted_at','questions_snapshot','passing_score','show_answers'],
   'public.test_attempt_start_requests':['user_id','lesson_id','request_id','session_id'],
   'public.test_attempts':['id','user_id','lesson_id','session_id','started_at','completed_at','score','max_score','answers','shown_question_ids','passing_score','passed'],
   'public.test_questions':['id','lesson_id','question','options','correct_answer','order_index','explanation','image_url','is_bank_question'],
   'public.lesson_progress':['user_id','lesson_id','completed','completed_at'],
   'storage.objects':['id','bucket_id','name','created_at','metadata'],
   'storage.buckets':['id','name','public','file_size_limit','allowed_mime_types'],
   'supabase_migrations.schema_migrations':['version','name','statements']
  };
  const colValues = Object.entries(colMap).flatMap(([table, columns])=>columns.map(col=>`(${quote(table)},${quote(col)})`)).join(',\n ');
  const prevValues = previous.map(f=>`(${quote('public.'+f.signature)},${quote(f.source_md5)})`).join(',\n ');
  const requiredValues = dependencies.map(s=>`(${quote(s)})`).join(',\n ');
  const newFunctions = signatures.slice(0,-3).map(s=>`(${quote(s)})`).join(',\n ');
  const coreChecks = `WITH required_columns(relation_name,column_name) AS (VALUES ${colValues}),
 required_functions(signature) AS (VALUES ${requiredValues}),
 expected_previous(signature,source_md5) AS (VALUES ${prevValues}),
 new_functions(signature) AS (VALUES ${newFunctions}),
 checks(check_name,ok) AS (
 SELECT 'required_columns', NOT EXISTS(SELECT 1 FROM required_columns r WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(r.relation_name) AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped))
 UNION ALL SELECT 'required_functions',NOT EXISTS(SELECT 1 FROM required_functions WHERE to_regprocedure(signature) IS NULL)
 UNION ALL SELECT 'api_roles',NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(name) WHERE to_regrole(name) IS NULL)
 UNION ALL SELECT 'schema_create_permission',has_schema_privilege(current_user,'public','CREATE') AND has_schema_privilege(current_user,'public','USAGE') AND has_schema_privilege(current_user,'storage','USAGE')
 UNION ALL SELECT 'alter_target_ownership',NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN (to_regclass('public.courses'),to_regclass('public.test_attempt_sessions')) AND NOT pg_has_role(current_user,c.relowner,'USAGE'))
 UNION ALL SELECT 'storage_policy_capability',coalesce((SELECT pg_has_role(current_user,c.relowner,'USAGE') FROM pg_class c WHERE c.oid=to_regclass('storage.objects')),false) OR EXISTS(SELECT 1 FROM pg_settings s WHERE s.name='supautils.policy_grants' AND s.context='sighup' AND s.vartype='string' AND jsonb_typeof(s.setting::jsonb->current_user::text)='array' AND (s.setting::jsonb->current_user::text) ? 'storage.objects')
 UNION ALL SELECT 'replace_rpc_ownership',NOT EXISTS(SELECT 1 FROM expected_previous e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) WHERE NOT pg_has_role(current_user,p.proowner,'USAGE'))
 UNION ALL SELECT 'ledger_bucket_write_permissions',has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') AND has_table_privilege(current_user,'storage.buckets','INSERT') AND has_table_privilege(current_user,'storage.buckets','UPDATE')
 UNION ALL SELECT 'replaced_rpc_source_hashes',NOT EXISTS(SELECT 1 FROM expected_previous e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) WHERE p.oid IS NULL OR md5(${norm('p.prosrc')}) IS DISTINCT FROM e.source_md5)
 UNION ALL SELECT 'prior_attempt_migrations_recorded',(SELECT count(*)=2 FROM supabase_migrations.schema_migrations WHERE version IN ('20260907120000','20260907120001'))
 UNION ALL SELECT 's029_version_absent',NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260929120000')
 UNION ALL SELECT 's029_table_absent',to_regclass('public.final_test_photo_challenges') IS NULL
 UNION ALL SELECT 's029_columns_absent',NOT EXISTS(SELECT 1 FROM pg_attribute WHERE (attrelid=to_regclass('public.courses') AND attname='require_final_test_photo' OR attrelid=to_regclass('public.test_attempt_sessions') AND attname='requires_final_test_photo') AND attnum>0 AND NOT attisdropped)
 UNION ALL SELECT 's029_functions_absent',NOT EXISTS(SELECT 1 FROM new_functions WHERE to_regprocedure(signature) IS NOT NULL)
 UNION ALL SELECT 's029_bucket_absent',NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='final-test-photos')
 UNION ALL SELECT 's029_policies_absent',NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('storage.objects') AND polname LIKE 'final_test_photos%')
 UNION ALL SELECT 'storage_owner_column',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('storage.objects') AND attname IN ('owner_id','owner') AND attnum>0 AND NOT attisdropped)
 UNION ALL SELECT 'storage_rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('storage.objects')),false)
 UNION ALL SELECT 'learner_result_insert_denied',NOT has_table_privilege('authenticated','public.test_attempts','INSERT') AND NOT has_table_privilege('anon','public.test_attempts','INSERT')
 )`;
  const preflight = `-- READ ONLY. First verify the selected Cloud project is ORIGINAL SINTAGMA / atxwvjxbqjgkbjlhsdch.\n-- SQL cannot independently authenticate the provider project identity. All rows must be true.\n${coreChecks}\nSELECT check_name,ok FROM checks ORDER BY check_name;\n\n-- Current executor diagnostics, no credentials. Ownership checks above use actual role membership.\nSELECT current_user AS executor,current_role AS active_role,current_setting('server_version') AS server_version,r.rolsuper,r.rolinherit FROM pg_roles r WHERE r.rolname=current_user;\n\n-- Recovery metadata only, no student rows. Compare against saved source.\n${funcsQuery(replaced)};\n`;
  const diagnosticsBoundary = preflight.indexOf('-- Current executor diagnostics');
  if(diagnosticsBoundary<0)throw new Error('Preflight diagnostics boundary missing');
  await save('preflight.sql', preflight.slice(0,diagnosticsBoundary));
  await save('preflight-diagnostics.sql', preflight.slice(diagnosticsBoundary));
  const backup = `-- READ ONLY. Save this result privately on D before replacing the three RPCs.\n-- No tokens, passwords or learner data selected. Do not post definitions/ACL outside this release.\nSELECT p.oid::regprocedure::text AS signature, pg_get_userbyid(p.proowner) AS function_owner,\n pg_get_functiondef(p.oid) AS definition, p.proacl::text AS explicit_acl,\n md5(${norm('p.prosrc')}) AS source_lf_md5,\n (SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'grantor',pg_get_userbyid(x.grantor),'privilege',x.privilege_type,'grantable',x.is_grantable)) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x) AS effective_acl\nFROM pg_proc p WHERE p.oid IN (${replaced.map(s=>`to_regprocedure(${quote(s)})`).join(',')}) ORDER BY signature;\n\nSELECT version,name,cardinality(statements) AS statement_count,\n md5(${norm("array_to_string(statements,E'\\n')")}) AS statement_lf_md5\nFROM supabase_migrations.schema_migrations ORDER BY version;\n`;
  await save('backup-functions.sql',backup);
  assert(!source.includes('$s029_exact_migration$'), 'Dollar delimiter must not collide');
  const wrapper = `-- S029 ONLY. No production execution implied by this file.\n-- Original ${migrationName}: ${migrationBytes.length} bytes, SHA256 ${sourceSha256}.\n-- Selected Cloud project and fresh recovery copy must be verified before execution.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='60s';\nSELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));\nLOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\nDO $s029_release$\nDECLARE\n v_failures text;\n v_source text := $s029_exact_migration$${source}$s029_exact_migration$;\nBEGIN\n IF md5(${norm('v_source')}) <> '${sourceMd5}' THEN RAISE EXCEPTION 'S029 source integrity mismatch'; END IF;\n ${coreChecks}\n SELECT string_agg(check_name,', ' ORDER BY check_name) INTO v_failures FROM checks WHERE ok IS DISTINCT FROM true;\n IF v_failures IS NOT NULL THEN RAISE EXCEPTION 'S029 preconditions failed: %',v_failures; END IF;\n EXECUTE v_source;\n INSERT INTO supabase_migrations.schema_migrations(version,name,statements)\n VALUES('20260929120000','final_test_photo',ARRAY[v_source]);\nEND;\n$s029_release$;\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n`;
  await save('release-transaction.sql', wrapper);
  let pre = (await db.exec(preflight))[0].rows;
  assert(pre.every(r=>r.ok===true), 'Fresh fixture preflight must pass');
  const capabilityCases=(await db.query(`WITH scenarios(name,owns_table,role_name,guc_context,guc_type,guc_name,setting,expected) AS (VALUES
    ('owner_no_delegation',true,'postgres',NULL,NULL,NULL,NULL,true),
    ('provider_exact_grant',false,'postgres','sighup','string','supautils.policy_grants','{"postgres":["storage.objects"]}',true),
    ('provider_wrong_role',false,'different_role','sighup','string','supautils.policy_grants','{"postgres":["storage.objects"]}',false),
    ('provider_wrong_table',false,'postgres','sighup','string','supautils.policy_grants','{"postgres":["storage.buckets"]}',false),
    ('untrusted_user_context',false,'postgres','user','string','supautils.policy_grants','{"postgres":["storage.objects"]}',false),
    ('wrong_setting_type',false,'postgres','sighup','bool','supautils.policy_grants','{"postgres":["storage.objects"]}',false),
    ('wrong_setting_name',false,'postgres','sighup','string','custom.policy_grants','{"postgres":["storage.objects"]}',false),
    ('wrong_json_shape',false,'postgres','sighup','string','supautils.policy_grants','{"postgres":"storage.objects"}',false),
    ('empty_config',false,'postgres','sighup','string','supautils.policy_grants','{}',false),
    ('no_config',false,'postgres',NULL,NULL,NULL,NULL,false)
   ) SELECT name,(owns_table OR coalesce(guc_name='supautils.policy_grants' AND guc_context='sighup' AND guc_type='string' AND jsonb_typeof(setting::jsonb->role_name)='array' AND (setting::jsonb->role_name) ? 'storage.objects',false)) IS NOT DISTINCT FROM expected AS ok FROM scenarios;`)).rows;
  for(const row of capabilityCases)assert(row.ok===true,'Storage provider capability predicate: '+row.name);
  assert((await db.exec(backup))[0].rows.length===3,'Backup query returns exactly three existing RPCs');
  await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;');
  await db.exec(wrapper);
  const installed = (await db.query(funcsQuery(signatures))).rows;
  assert(installed.length===10,'All ten photo functions exist');
  const expectedFuncs = installed.map(f=>`(${quote('public.'+f.signature)},${quote(f.source_md5)},${f.prosecdef},${quote(f.provolatile)},${quote(f.result_type)},${f.anon_execute},${f.authenticated_execute},${f.signature.startsWith('_final_test_photo_')?'NULL::boolean':f.service_execute})`).join(',\n ');
  const schema = (await db.query(`SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.final_test_photo_challenges'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`)).rows;
  const schemaValues = schema.map(c=>`(${quote(c.attname)},${quote(c.type)},${c.attnotnull},${c.default_expr===null?'NULL':quote(c.default_expr)})`).join(',\n ');
  const constraints = (await db.query(`SELECT conname,contype,md5(pg_get_constraintdef(oid)) AS definition_md5 FROM pg_constraint WHERE conrelid='public.final_test_photo_challenges'::regclass ORDER BY conname`)).rows;
  const consValues = constraints.map(c=>`(${quote(c.conname)},${quote(c.contype)},${quote(c.definition_md5)})`).join(',\n ');
  const policies = (await db.query(`SELECT polname,polcmd,polpermissive,md5(coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')) AS expression_md5 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname LIKE 'final_test_photos%' ORDER BY polname`)).rows;
  const polValues = policies.map(p=>`(${quote(p.polname)},${quote(p.polcmd)},${p.polpermissive},${quote(p.expression_md5)})`).join(',\n ');
  const post = `-- READ ONLY. Exact expected catalog contract from unchanged migration in isolated PostgreSQL/PGlite.\n-- Each *_ok must be true. Definition formatting hashes can vary across PostgreSQL versions;\n-- a mismatch requires inspection, never silently changing expected values or reapplying SQL.\nWITH expected(signature,source_md5,security_definer,volatility,result_type,anon_execute,authenticated_execute,service_execute) AS (VALUES ${expectedFuncs})\nSELECT e.signature,p.oid IS NOT NULL AS exists_ok,md5(${norm('p.prosrc')})=e.source_md5 AS source_hash_ok,\n p.prosecdef=e.security_definer AS security_definer_ok,p.provolatile::text=e.volatility AS volatility_ok,\n p.proconfig=ARRAY['search_path=public, pg_temp']::text[] AS search_path_ok,pg_get_function_result(p.oid)=e.result_type AS result_type_ok,\n has_function_privilege('anon',p.oid,'EXECUTE')=e.anon_execute AS anon_acl_ok,\n has_function_privilege('authenticated',p.oid,'EXECUTE')=e.authenticated_execute AS authenticated_acl_ok,\n has_function_privilege('service_role',p.oid,'EXECUTE')=e.service_execute AS service_acl_ok\nFROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) ORDER BY e.signature;\n\nWITH expected(name,type,not_null,default_expr) AS (VALUES ${schemaValues})\nSELECT e.name,a.attname IS NOT NULL AS exists_ok,format_type(a.atttypid,a.atttypmod)=e.type AS type_ok,\n a.attnotnull=e.not_null AS nullability_ok,pg_get_expr(d.adbin,d.adrelid) IS NOT DISTINCT FROM e.default_expr AS default_ok\nFROM expected e LEFT JOIN pg_attribute a ON a.attrelid=to_regclass('public.final_test_photo_challenges') AND a.attname=e.name AND a.attnum>0 AND NOT a.attisdropped\nLEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum ORDER BY e.name;\n\nWITH expected(name,type,definition_md5) AS (VALUES ${consValues})\nSELECT e.name,c.oid IS NOT NULL AS exists_ok,c.contype::text=e.type AS type_ok,md5(pg_get_constraintdef(c.oid))=e.definition_md5 AS definition_ok\nFROM expected e LEFT JOIN pg_constraint c ON c.conrelid=to_regclass('public.final_test_photo_challenges') AND c.conname=e.name ORDER BY e.name;\n\nWITH expected(name,command,permissive,expression_md5) AS (VALUES ${polValues})\nSELECT e.name,p.oid IS NOT NULL AS exists_ok,p.polcmd::text=e.command AS command_ok,p.polpermissive=e.permissive AS permissive_ok,\n md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))=e.expression_md5 AS expression_ok,\n p.polroles=CASE WHEN e.name IN ('final_test_photos_insert','final_test_photos_select') THEN ARRAY[to_regrole('authenticated')::oid] ELSE ARRAY[0::oid] END AS roles_ok\nFROM expected e LEFT JOIN pg_policy p ON p.polrelid=to_regclass('storage.objects') AND p.polname=e.name ORDER BY e.name;\n\nSELECT (SELECT count(*)=1 FROM supabase_migrations.schema_migrations WHERE version='20260929120000' AND name='final_test_photo' AND cardinality(statements)=1 AND md5(${norm('statements[1]')})='${sourceMd5}') AS exact_ledger_ok,\n (SELECT count(*)=1 FROM storage.buckets WHERE id='final-test-photos' AND name='final-test-photos' AND NOT public AND file_size_limit=5242880 AND allowed_mime_types=ARRAY['image/jpeg']) AS bucket_ok,\n (SELECT count(*)=6 FROM pg_policy WHERE polrelid=to_regclass('storage.objects') AND polname LIKE 'final_test_photos%') AS policy_count_ok,\n (SELECT count(*)=${schema.length} FROM pg_attribute WHERE attrelid=to_regclass('public.final_test_photo_challenges') AND attnum>0 AND NOT attisdropped) AS column_count_ok,\n (SELECT count(*)=${constraints.length} FROM pg_constraint WHERE conrelid=to_regclass('public.final_test_photo_challenges')) AS constraint_count_ok,\n (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.final_test_photo_challenges')) AS challenges_rls_ok,\n (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('storage.objects')) AS storage_rls_ok,\n NOT has_table_privilege('authenticated','public.final_test_photo_challenges','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS no_authenticated_table_grants_ok,\n NOT has_table_privilege('anon','public.final_test_photo_challenges','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS no_anon_table_grants_ok,\n has_table_privilege('service_role','public.final_test_photo_challenges','SELECT') AND has_table_privilege('service_role','public.final_test_photo_challenges','INSERT') AND has_table_privilege('service_role','public.final_test_photo_challenges','UPDATE') AND has_table_privilege('service_role','public.final_test_photo_challenges','DELETE') AS service_grants_ok,\n NOT has_table_privilege('authenticated','public.test_attempts','INSERT') AND NOT has_table_privilege('anon','public.test_attempts','INSERT') AS direct_result_insert_denied_ok,\n (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND ((table_name='courses' AND column_name='require_final_test_photo') OR (table_name='test_attempt_sessions' AND column_name='requires_final_test_photo')) AND data_type='boolean' AND is_nullable='NO' AND column_default='false') AS false_default_columns_ok,\n (SELECT count(*)=0 FROM public.courses WHERE require_final_test_photo) AS all_course_switches_off_ok,\n (SELECT count(*)=0 FROM public.test_attempt_sessions WHERE requires_final_test_photo) AS existing_sessions_unchanged_ok,\n (SELECT count(*)=0 FROM public.final_test_photo_challenges) AS no_photo_challenges_before_activation_ok;\n`;
  const finalPost = post.replace("has_function_privilege('service_role',p.oid,'EXECUTE')=e.service_execute AS service_acl_ok", "(e.service_execute IS NULL OR has_function_privilege('service_role',p.oid,'EXECUTE')=e.service_execute) AS service_acl_ok");
  await save('postcheck.sql',finalPost);
  const results=await db.exec(finalPost);
  for (const result of results) for (const row of result.rows) for (const [key,value] of Object.entries(row)) if (key.endsWith('_ok')) assert(value===true,`Postcheck failed: ${row.signature||row.name||'summary'} ${key}`);
  await db.exec('REVOKE EXECUTE ON FUNCTION public._final_test_photo_required(uuid),public._final_test_photo_object_valid(uuid) FROM service_role;');
  const noDefaultServices=(await db.exec(finalPost))[0].rows;
  for (const row of noDefaultServices.filter(r=>r.signature.startsWith('public._final_test_photo_'))) assert(row.service_acl_ok===true,'Internal service_role ACL is not constrained by this migration');
  const ledger = (await db.query("SELECT statements[1] AS source FROM supabase_migrations.schema_migrations WHERE version='20260929120000'")).rows[0].source;
  assert(lf(ledger)===lf(source),'Ledger must preserve exact migration except CRLF normalization');
  let repeatFailed=false; try { await db.exec(wrapper); } catch(e) { repeatFailed=/S029 preconditions failed/.test(e.message); await db.exec('ROLLBACK'); }
  assert(repeatFailed,'Replay must fail explicitly before changes');
  assert((await db.query("SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations WHERE version='20260929120000'")).rows[0].n===1,'Replay retains exactly one ledger entry');
  const broken = await fixture();
  try {
    const baseline=(await broken.query(funcsQuery(replaced))).rows;
    await broken.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT fixture_reject_s029 CHECK(version<>'20260929120000');");
    let failed=false; try{await broken.exec(wrapper);}catch(e){failed=e.code==='23514';await broken.exec('ROLLBACK');}
    assert(failed,'Artificial ledger failure must abort wrapper');
    const rollback=(await broken.query("SELECT to_regclass('public.final_test_photo_challenges') IS NULL AS absent,NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='final-test-photos') AS bucket_absent,NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.courses'::regclass AND attname='require_final_test_photo' AND NOT attisdropped) AS column_absent,NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname LIKE 'final_test_photos%') AS policies_absent")).rows[0];
    for(const [key,value] of Object.entries(rollback))assert(value===true,'Rollback must restore '+key);
    assert(JSON.stringify((await broken.query(funcsQuery(replaced))).rows)===JSON.stringify(baseline),'Rollback restores previous RPC definitions and ACL');
    await broken.exec("ALTER TABLE supabase_migrations.schema_migrations DROP CONSTRAINT fixture_reject_s029; CREATE OR REPLACE FUNCTION public.get_student_test_state(p_lesson_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN RETURN '{}'::jsonb; END $$;");
    let driftFailed=false;try{await broken.exec(wrapper);}catch(e){driftFailed=/replaced_rpc_source_hashes/.test(e.message);await broken.exec('ROLLBACK');}
    assert(driftFailed,'Changed production RPC source must block package');
  } finally {await broken.close();}
  const artifactNames=['preflight.sql','preflight-diagnostics.sql','backup-functions.sql','release-transaction.sql','postcheck.sql'];
  const artifacts=[];for(const name of artifactNames){const bytes=await readFile(path.join(here,name));artifacts.push({file:name,bytes:bytes.length,sha256:hash('sha256',bytes)});}
  await save('validation.json',JSON.stringify({observedAt:new Date().toISOString(),status:'passed',assertions,engine:'Existing PGlite / synthetic fixture, no network',source:{file:'supabase/migrations/'+migrationName,bytes:migrationBytes.length,sha256:sourceSha256,lfMd5:sourceMd5},artifacts,productionExecuted:false,checks:['preflight baseline','recovery query','transaction commit and exact ledger','postcheck catalog and privileges','replay refusal','full DDL/function/policy rollback on ledger failure','live-source drift refusal'],notCovered:['provider transport/project identity','fresh production backup','live multi-connection locks','PostgREST notification delivery','Storage HTTP','camera']},null,2)+'\n');
  console.log(JSON.stringify({status:'passed',assertions,sourceSha256,sourceLfMd5:sourceMd5,artifacts}));
} finally {await db.close();}
