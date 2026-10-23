/** Native-only recovery of CURRENT622 provider Auth and org-document Storage metadata.
 * No customer rows, credentials, product SQL, fabricated predicates or Auth HTTP claims. */
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
const digest=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const md5=(s:string)=>createHash('md5').update(s).digest('hex');
const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const one=async(db:any,sql:string,args:any[]=[])=>((await db.query(sql,args)).rows??[])[0];
const authPin={path:'native-input/CURRENT622_AUTH_STORAGE_SELECT_METADATA.json',sha256:'d62581deeef07ead77df970fbecbd3692ba7a0ca372c95520ce98c47f0fb22ca'};
const helperPin={path:'native-input/CURRENT622_AUTH_STORAGE_HELPERS_METADATA.json',sha256:'ecbbaf0f64fd203532d86c4a2fb6c78c9ce98561b10dbac1e978684b7ad78d9f'};
function load(pin:{path:string;sha256:string}){const raw=readFileSync(pin.path);if(digest(raw)!==pin.sha256)throw Error('Actual CURRENT622 native capture drift '+pin.path);const p=JSON.parse(raw.toString('utf8'));if(p.status!=='ACTUAL_CURRENT622_READ_ONLY_METADATA_CAPTURE'||p.project_id!=='d57ddcdf-2d1b-42ec-8bfb-3484123b5ff2'||!/^SELECT /.test(p.sql))throw Error('Actual metadata-only capture required');return p.result.rows;}
function body(definition:string){const m=/AS (\$[A-Za-z0-9_]*\$)([\s\S]*?)\1/.exec(definition);if(!m)throw Error('Captured exact function body required');return m[2];}
async function nativeOwner(db:any){if(process.env.UC116_NATIVE_MODE!=='full'||!db?.native)throw Error('Owned isolated native adapter only');const c=await one(db,'SELECT current_user u');if(c?.u!=='postgres')throw Error('Explicit native installer owner required');}
function aclEntries(raw:string|string[]){const entries=Array.isArray(raw)?raw:raw.slice(1,-1).split(',');return entries.map(x=>{const m=/^([^=]*)=([X*]+)\/([^/]+)$/.exec(x);if(!m||m[2]!=='X')throw Error('Only captured non-grantable function EXECUTE ACL supported');return{role:m[1]||'PUBLIC',grantor:m[3]};});}
async function restoreAcl(db:any,signature:string,captured:any){
 const roles=(await db.query('SELECT rolname FROM pg_roles')).rows.map((r:any)=>r.rolname),known=new Set(roles);
 const own=await one(db,'SELECT pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid=to_regprocedure($1)',[signature]);if(own?.owner!=='postgres')throw Error('Native function owner mapping requires postgres');
 const current=(await db.query("SELECT DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC'ELSE pg_get_userbyid(a.grantee)END role FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=to_regprocedure($1)",[signature])).rows;
 for(const r of current)await db.exec('REVOKE ALL ON FUNCTION '+signature+' FROM '+(r.role==='PUBLIC'?'PUBLIC':q(r.role)));
 const desired=[...new Set(aclEntries(captured.acl).map(e=>e.role===captured.owner?'postgres':e.role).filter(r=>r==='PUBLIC'||known.has(r)))];
 for(const r of desired)await db.exec('GRANT EXECUTE ON FUNCTION '+signature+' TO '+(r==='PUBLIC'?'PUBLIC':q(r)));
 return{signature,provider_owner:captured.owner,native_owner:'postgres',native_grantees:desired.sort(),provider_roles_not_created:aclEntries(captured.acl).map(e=>e.role).filter(r=>r!=='PUBLIC'&&!known.has(r)&&r!==captured.owner)};
}
async function exactFunction(db:any,f:any,signature:string){const found=await one(db,'SELECT md5(prosrc) body_md5,prosecdef security_definer,provolatile volatility,proconfig config,pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid=to_regprocedure($1)',[signature]);if(!found||found.body_md5!==md5(body(f.definition))||found.security_definer!==f.security_definer||found.volatility!==f.volatility||JSON.stringify(found.config)!==JSON.stringify(f.config))throw Error('Actual CURRENT622 function mismatch '+signature);return{signature,body_md5:found.body_md5,exact_body_attributes:true,provider_owner:f.owner,native_owner:found.owner};}
const installedAuth=new WeakSet<object>();
/** Called from the first native caller, after initial Auth schema exists and before JSON-only claims. */
export async function installActualFrdoNativeAuth(db:any){
 if(installedAuth.has(db))return;
 if(process.env.UC116_NATIVE_MODE!=='full'||!process.env.UC116_NATIVE_DATA)throw Error('Explicit owned native Auth environment required');
 const identity=await one(db,"SELECT current_setting('server_version')version,current_setting('data_directory')dir,current_user u");if(!String(identity?.version).startsWith('17.11')||identity.dir!==process.env.UC116_NATIVE_DATA||identity.u!=='postgres')throw Error('Exact owned native database Auth installer/readback required');
 const rows=load(authPin);if(rows.length!==1||rows[0].metadata.auth_functions.length!==3)throw Error('Exactly three provider Auth functions required');
 const existing=(await db.query("SELECT n.nspname||'.'||p.proname||'()'signature,md5(p.prosrc) body_md5,p.prosecdef security_definer,p.provolatile volatility,p.proconfig config FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth'AND p.proname IN('uid','role','jwt')AND p.pronargs=0")).rows;
 // A second captured connection to the same database must not issue DDL while
 // the first owns a real transaction. Compare the exact already-restored bodies.
 const exactAlready=rows[0].metadata.auth_functions.every((f:any)=>{const e=existing.find((x:any)=>x.signature===f.signature);return e&&e.body_md5===md5(body(f.definition))&&e.security_definer===f.security_definer&&e.volatility===f.volatility&&JSON.stringify(e.config)===JSON.stringify(f.config);});
 if(exactAlready){installedAuth.add(db);return;}
 await nativeOwner(db);
 for(const f of rows[0].metadata.auth_functions){if(!['auth.uid()','auth.role()','auth.jwt()'].includes(f.signature)||f.security_definer)throw Error('Exact non-definer provider Auth functions only');await db.exec(f.definition);await exactFunction(db,f,f.signature);await restoreAcl(db,f.signature,f);}
 installedAuth.add(db);
}
/** Called after genuine K622 and before the S3 preservation baseline. */
export async function installActualFrdoNativeRuntime(db:any){
 await nativeOwner(db);await installActualFrdoNativeAuth(db);const meta=load(authPin)[0].metadata,helpers=load(helperPin);const auth=[];for(const f of meta.auth_functions)auth.push(await exactFunction(db,f,f.signature));
 const required=['account_deletion_access_allowed()','can_access_organization(uuid,text)','has_org_staff_permission(uuid,uuid,text)','has_role(app_role,uuid)','has_role(uuid,app_role)','storage_try_uuid(text)','uc_document_storage_scope(text,text)','uc_document_action_allowed(uuid,text,uuid,uuid)','uc_document_storage_access(text,text,boolean)'];
 const publicHelpers=[];for(const signature of required){const f=helpers.find((x:any)=>x.schema==='public'&&x.signature===signature);if(!f)throw Error('Actual supporting helper capture missing '+signature);publicHelpers.push(await exactFunction(db,f,'public.'+signature));}
 const folder=helpers.find((x:any)=>x.schema==='storage'&&x.signature==='storage.foldername(text)');if(!folder||folder.security_definer)throw Error('Exact provider foldername required');await db.exec(folder.definition);const folderProof=await exactFunction(db,folder,'storage.foldername(text)');const ownerMapping=await restoreAcl(db,'storage.foldername(text)',folder);
 const storage=await one(db,"SELECT c.relrowsecurity rls,has_table_privilege('authenticated',c.oid,'SELECT') selectable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage'AND c.relname='objects'");if(!storage?.rls||!storage?.selectable)throw Error('Actual protected native Storage table required');
 const policies=[];for(const name of['Admins can manage all org documents','org_documents_select','account_deletion_no_revoked_access','uc_document_assigned_storage_read']){
  const p=meta.storage_select_policies.find((x:any)=>x.name===name);if(!p||!['r','*'].includes(p.command))throw Error('Exact applicable Storage policy missing '+name);
  const old=await one(db,"SELECT polcmd command,polpermissive permissive,pg_get_expr(polqual,polrelid) qual,pg_get_expr(polwithcheck,polrelid) with_check,ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC'ELSE pg_get_userbyid(r)END FROM unnest(polroles)r) roles FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname=$1",[name]);
  const same=!!old&&old.command===p.command&&old.permissive===p.permissive&&old.qual===p.using&&old.with_check===p.check&&JSON.stringify([...old.roles].sort())===JSON.stringify([...p.roles].sort());
  if(!same){if(old)await db.exec('DROP POLICY '+q(name)+' ON storage.objects');await db.exec('CREATE POLICY '+q(name)+' ON storage.objects AS '+(p.permissive?'PERMISSIVE':'RESTRICTIVE')+' FOR '+(p.command==='*'?'ALL':'SELECT')+' TO '+p.roles.map((r:string)=>r==='PUBLIC'?'PUBLIC':q(r)).join(',')+' USING ('+p.using+')'+(p.check===null?'':' WITH CHECK ('+p.check+')'));}
  const after=await one(db,"SELECT polcmd command,polpermissive permissive,pg_get_expr(polqual,polrelid) qual,pg_get_expr(polwithcheck,polrelid) with_check,ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC'ELSE pg_get_userbyid(r)END FROM unnest(polroles)r) roles FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname=$1",[name]);
  if(after.command!==p.command||after.permissive!==p.permissive||after.qual!==p.using||after.with_check!==p.check||JSON.stringify([...after.roles].sort())!==JSON.stringify([...p.roles].sort()))throw Error('Exact Storage policy restoration failed '+name);
  policies.push({name,provider_command:p.command,provider_permissive:p.permissive,roles:[...p.roles].sort(),definition_restored_exact:true,was_already_exact:same});
 }
 return{status:'PASS_ACTUAL_CURRENT622_NATIVE_AUTH_AND_ORG_DOCUMENT_STORAGE',captures:[authPin,helperPin],captured_at:meta.captured_at,auth,publicHelpers,folder:folderProof,provider_owner_mapping:ownerMapping,policies,other_storage_policies_unchanged:true,customer_rows_read_or_copied:0,product_changes:0,legacy_claims_cleared_by_caller:true,json_only_request_claims:true,scope:'Native SQL role/metadata fidelity; not Auth or Storage HTTP acceptance.'};
}
