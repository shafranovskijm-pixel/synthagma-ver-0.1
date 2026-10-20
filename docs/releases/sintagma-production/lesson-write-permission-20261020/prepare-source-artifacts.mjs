// Source writer only. No SQL execution, test engine, build, network or Git writes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath}from'node:url';
import {createHash}from'node:crypto';
const folder=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(folder,'../../../..');
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
const emit=(p,s)=>fs.writeFileSync(p,typeof s==='string'?s:JSON.stringify(s,null,2)+'\n');
const capturePath='supabase/tests/fixtures/lesson-write-guard-live-metadata.json';
const capture=JSON.parse(read(path.join(root,capturePath)));
const functions=[...capture.functions,...capture.additional_closure.functions];
if(functions.length!==24||capture.applicationRowsRead!==0||capture.productionWrites!==0)throw Error('Finite metadata source boundary changed');
const relations=capture.relations.filter(r=>r.relname==='courses'||r.relname==='lessons');
const roleName=oid=>oid==='0'?'PUBLIC':capture.additional_closure.roles.find(r=>r.oid===oid)?.name??(()=>{throw Error('Unknown policy role');})();
// Preserve the server's captured ORDER BY polname/tgname. Host JS localeCompare
// ordering is not evidence for PostgreSQL collation and must not rewrite it.
const policyProof=relations.map(r=>({name:r.relname,rls:r.relrowsecurity,force_rls:r.relforcerowsecurity,owner:r.owner,acl:r.relacl,policies:r.policies.map(p=>({name:p.name,command:p.command,permissive:p.permissive,roles:p.roles.map(roleName).sort(),using:p.using,with_check:p.with_check})),triggers:r.relname==='lessons'?r.triggers.map(t=>({name:t.name,definition:t.definition,enabled:t.enabled})):null}));
const proof={functions:functions.map(f=>({signature:f.signature.includes('.')?f.signature:'public.'+f.signature,definition_md5:f.definition_md5})),relations:policyProof};
const body=read(path.join(folder,'candidate-body.sql'));
const preflight=`-- SOURCE AUTHORED ONLY. Requires reviewed isolated baseline/candidate reproduction.\nDO $preflight$ DECLARE proof jsonb:=$lesson_proof$${JSON.stringify(proof)}$lesson_proof$;f jsonb;r jsonb;actual jsonb;BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='lesson_write_guard_allowed')OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.lessons'::regclass AND polname IN('lesson_write_guard_insert','lesson_write_guard_update','lesson_write_guard_delete'))THEN RAISE EXCEPTION 'LESSON_WRITE_GUARD_NAME_COLLISION';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated'AND NOT rolsuper AND NOT rolbypassrls)THEN RAISE EXCEPTION 'LESSON_WRITE_GUARD_AUTH_ROLE_CHANGED';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(proof->'functions')LOOP
  IF to_regprocedure(f->>'signature')IS NULL OR md5(pg_get_functiondef(to_regprocedure(f->>'signature')))IS DISTINCT FROM f->>'definition_md5'THEN RAISE EXCEPTION 'LESSON_WRITE_GUARD_SOURCE_CHANGED:%',f->>'signature';END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(proof->'relations')LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||(r->>'name'))AND c.relrowsecurity=(r->>'rls')::boolean AND c.relforcerowsecurity=(r->>'force_rls')::boolean AND pg_get_userbyid(c.relowner)=r->>'owner'AND c.relacl::text=r->>'acl')THEN RAISE EXCEPTION 'LESSON_WRITE_GUARD_TABLE_METADATA_CHANGED:%',r->>'name';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC'ELSE pg_get_userbyid(role_id)::text END ORDER BY CASE WHEN role_id=0 THEN 'PUBLIC'ELSE pg_get_userbyid(role_id)::text END)FROM unnest(p.polroles)role_id),'using',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid))ORDER BY p.polname),'[]')INTO actual FROM pg_policy p WHERE p.polrelid=to_regclass('public.'||(r->>'name'));
  IF actual IS DISTINCT FROM r->'policies'THEN RAISE EXCEPTION 'LESSON_WRITE_GUARD_POLICIES_CHANGED:%',r->>'name';END IF;
  IF r->>'name'='lessons'THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)ORDER BY t.tgname),'[]')INTO actual FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||(r->>'name'))AND NOT t.tgisinternal;
   IF actual IS DISTINCT FROM r->'triggers'THEN RAISE EXCEPTION 'LESSON_WRITE_GUARD_TRIGGERS_CHANGED:%',r->>'name';END IF;
  END IF;
 END LOOP;
END;$preflight$;\n`;
// The isolated fixture includes all real lesson triggers. Unrelated course
// provisioning triggers are captured as metadata evidence but not installed in
// this reduced model: no fixture actor inserts/updates/deletes a course.
const migrationPath='supabase/migrations/20261020090000_lesson_write_permission_guard.sql';
emit(path.join(root,migrationPath),preflight+'\n'+body);
emit(path.join(folder,'source-manifest.json'),{status:'SOURCE_AUTHORED_NOT_EXECUTED_NOT_DEPLOYED',base:'3be046252a07e8b5b68400508a1e3138e3bf4e09',version:'20261020090000',migration:migrationPath,migration_sha256:hash(preflight+'\n'+body),capture:capturePath,capture_sha256:hash(fs.readFileSync(path.join(root,capturePath))),original_function_count:24,new_function:'public.lesson_write_guard_allowed(uuid)',new_policy_count:3,product_tables_changed:0,original_select_policies_changed:0,original_acl_changed:0,dependencies:'Released auth/account/organization/admin/paid helpers only; no UC013/014 helper dependency',not_claimed:['Actual SQL reproduction or test PASS','Native acceptance','Production apply','Module overrides/schedules repaired']});
console.log(JSON.stringify({sourceAuthoringOnly:true,migration:migrationPath,functionsPinned:functions.length,migration_sha256:hash(preflight+'\n'+body)}));
