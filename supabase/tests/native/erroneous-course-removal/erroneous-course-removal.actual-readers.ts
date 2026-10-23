/** Exact native-only four missing preexisting reader bodies before the product-change baseline. No provider write or authorization stub. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const one = async (db:any,sql:string,args:any[]=[]) => (await db.query(sql,args)).rows[0];
const q = (s:string) => '"'+s.replaceAll('"','""')+'"';
const expected = '4779ccd5f1f48884c487977b9793790ceb647caa893a8d50e660bc4affde7184';
const readers = ['get_available_students_for_course_page','get_course_student_test_results_page','get_course_students_stats','get_organization_students_page'];
function signature(f:any) { return 'public.'+f.proname+'('+f.identity_arguments.split(',').filter(Boolean).map((x:string)=>x.trim().split(/\s+/).slice(1).join(' ')).join(',')+')'; }
const columns = "md5(p.prosrc)prosrc_md5,pg_get_userbyid(p.proowner)owner,p.proconfig,p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,p.proleakproof,p.procost::text,p.prorows::text,p.proretset,p.prokind,p.pronargs,p.pronargdefaults,p.proargnames,p.proargmodes::text proargmodes,p.prorettype::regtype::text return_type,pg_get_function_arguments(p.oid)arguments";
async function verify(db:any,f:any,sig:string,allAcl=false) { const current=await one(db,'SELECT '+columns+' FROM pg_proc p WHERE p.oid=to_regprocedure($1)',[sig]);
 for (const key of Object.keys(current || {})) if (JSON.stringify(current[key])!==JSON.stringify(f[key])) throw Error('Captured reader metadata mismatch '+sig+':'+key);
 if (!current) throw Error('Captured reader missing '+sig);
 for (const role of ['anon','authenticated','service_role']) { const wanted=f.acl.some((a:string)=>a.startsWith(role+'=X/')||a.startsWith('=X/')); const actual=(await one(db,"SELECT has_function_privilege($1,$2,'EXECUTE')allowed",[role,sig])).allowed; if(actual!==wanted)throw Error('Captured reader known-role ACL mismatch '+sig+':'+role); }
 if(allAcl) { const acl=(await one(db,'SELECT proacl::text[] acl FROM pg_proc WHERE oid=to_regprocedure($1)',[sig])).acl || [];if(JSON.stringify([...acl].sort())!==JSON.stringify([...f.acl].sort()))throw Error('Exact captured reader full ACL differs '+sig); }
 return {signature:sig,body:f.prosrc_md5,bodyAttributesAndKnownRoleACLVerified:true,fullAclVerified:allAcl}; }
export async function installActualRemovalReaders(db:any) {
 if(process.env.UC116_NATIVE_MODE!=='full'||!db?.native)throw Error('Owned isolated native only');
 const env=await one(db,"SELECT current_user u,current_setting('server_version_num')v,current_setting('port')port,current_database()db");
 if(env.u!=='postgres'||env.v!=='170011'||env.port!=='55483'||env.db!==db.native.name||!/^uc116_case_[0-9]{3}$/.test(env.db))throw Error('Exact owned PostgreSQL17.11 boundary required');
 const raw=readFileSync('native-input/REMOVAL_READER_RUNTIME_METADATA.json');
 if(createHash('sha256').update(raw).digest('hex')!==expected)throw Error('Exact read-only reader capture required');
 const data=JSON.parse(raw.toString('utf8'));if(!Array.isArray(data.rows)||data.rows.length!==9)throw Error('Exactly four readers and five real helpers required');
 const helpers=[];
 for(const f of data.rows.filter((x:any)=>!readers.includes(x.proname)))helpers.push(await verify(db,f,signature(f)));
 const installed=[];
 await db.exec('BEGIN');try {
  for(const f of data.rows.filter((x:any)=>readers.includes(x.proname))) {
   const sig=signature(f),prior=await one(db,'SELECT to_regprocedure($1)::text id',[sig]);
   if(prior.id && (await one(db,'SELECT pg_get_functiondef(to_regprocedure($1))definition',[sig])).definition!==f.definition)throw Error('Preexisting reader must have byte-exact captured definition '+sig);
   if(f.owner!=='postgres'||f.nspname!=='public'||f.prokind!=='f')throw Error('Exact original reader owner/kind required');
   if(!prior.id)await db.exec(f.definition);
   const grants=(await db.query("SELECT DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC'ELSE pg_get_userbyid(a.grantee)END role FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=to_regprocedure($1)",[sig])).rows;
   for(const g of grants)await db.exec('REVOKE ALL ON FUNCTION '+sig+' FROM '+(g.role==='PUBLIC'?'PUBLIC':q(g.role)));
   for(const acl of f.acl) { const match=/^([^=]*)=X\/postgres$/.exec(acl);if(!match)throw Error('Only exact captured non-grantable execute allowed');const role=match[1]||'PUBLIC';if(role!=='PUBLIC'&&!(await one(db,'SELECT 1 n FROM pg_roles WHERE rolname=$1',[role])))throw Error('Captured provider role must already exist');await db.exec('GRANT EXECUTE ON FUNCTION '+sig+' TO '+(role==='PUBLIC'?'PUBLIC':q(role))); }
   installed.push({...await verify(db,f,sig,true),alreadyPresent:!!prior.id});
  }
  await db.exec('COMMIT');
 }catch(e){await db.exec('ROLLBACK');throw e;}
 return {status:'PASS',captureSHA256:expected,exactFourOldReadersRestoredBeforeBaseline:installed.length===4,helperBodiesNotReplaced:true,helperKnownRoleExecuteOnlyVerified:true,noNewRoles:true,noRowMutation:true,providerWrites:false,installed,helpers};
}

export { signature as nativeFunctionSignature, verify as verifyNativeFunction };
