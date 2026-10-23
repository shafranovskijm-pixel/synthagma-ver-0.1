/** Isolated native-only exact current billing prerequisite restoration. No real agreement, customer row, or production action. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { nativeFunctionSignature, verifyNativeFunction } from './erroneous-course-removal.actual-readers';
const one=async(db:any,sql:string,args:any[]=[]) => (await db.query(sql,args)).rows[0];
const q=(s:string) => '"'+s.replaceAll('"','""')+'"';
const hash='241434b067a22d83b2b388f1e59840bc1f2780cb045ee20b85d192e47dc2be5c';
export async function installActualRemovalBilling(db:any) {
 if(process.env.UC116_NATIVE_MODE!=='full'||!db?.native)throw Error('Owned isolated native only');
 const env=await one(db,"SELECT current_user u,current_setting('server_version_num')v,current_setting('port')port,current_database()db");
 if(env.u!=='postgres'||env.v!=='170011'||env.port!=='55483'||env.db!==db.native.name||!/^uc116_case_[0-9]{3}$/.test(env.db))throw Error('Exact native environment required');
 const raw=readFileSync('native-input/REMOVAL_BILLING_RUNTIME_METADATA.json');
 if(createHash('sha256').update(raw).digest('hex')!==hash)throw Error('Exact billing metadata capture required');
 const data=JSON.parse(raw.toString('utf8'));
 if(data.status!=='ACTUAL_READ_ONLY_METADATA_CAPTURE'||data.customerRowsRead!==false||data.functions.length!==7||data.relations.length!==3||data.triggers.length!==2)throw Error('Exact billing prerequisite closure required');
 const functions:any[]=[],relations:any[]=[],triggers:any[]=[],initialRows:any={};
 const rowDigest=async(rel:string)=>(await one(db,"SELECT count(*)::int n,md5(coalesce(string_agg(to_jsonb(r)::text,'|'ORDER BY to_jsonb(r)::text),''))digest FROM "+rel+' r'));
 const columnQuery="SELECT a.attname name,format_type(a.atttypid,a.atttypmod)type,a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid)default,a.attgenerated generated,a.attidentity identity FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=to_regclass($1)AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum";
 await db.exec('BEGIN');try {
  for(const r of data.relations) {
   if(!['organization_monthly_course_usage','organization_billing_agreements','postpaid_usage_events'].includes(r.relname)||r.owner!=='postgres'||r.force_rls||!r.rls)throw Error('Unexpected actual billing relation');
   const rel='public.'+q(r.relname),prior=await one(db,'SELECT to_regclass($1)::text id',[rel]);
   if(r.columns.some((c:any)=>c.generated||c.identity))throw Error('Unsupported generated billing column');
   if(!prior.id)await db.exec('CREATE TABLE '+rel+'('+r.columns.map((c:any)=>q(c.name)+' '+c.type+(c.default?' DEFAULT '+c.default:'')+(c.not_null?' NOT NULL':'')).join(',')+')');
   initialRows[r.relname]=await rowDigest(rel);
   const before=(await db.query(columnQuery,[rel])).rows;
   if(before.some((c:any)=>!r.columns.some((x:any)=>x.name===c.name&&x.type===c.type&&x.generated===c.generated&&x.identity===c.identity)))throw Error('Unexpected prerequisite column '+r.relname);
   const incomplete=before.length!==r.columns.length;
   if(incomplete&&(r.relname!=='organization_billing_agreements'||initialRows[r.relname].n!==0||before.length!==4||!['id','organization_id','effective_from','effective_to'].every(n=>before.some((c:any)=>c.name===n))))throw Error('Only exact empty four-column original agreement scaffold may be extended');
   for(const c of r.columns){if(!before.some((x:any)=>x.name===c.name))await db.exec('ALTER TABLE '+rel+' ADD COLUMN '+q(c.name)+' '+c.type);await db.exec('ALTER TABLE '+rel+' ALTER COLUMN '+q(c.name)+(c.default?' SET DEFAULT '+c.default:' DROP DEFAULT'));await db.exec('ALTER TABLE '+rel+' ALTER COLUMN '+q(c.name)+(c.not_null?' SET NOT NULL':' DROP NOT NULL'));}
   const owner=await one(db,'SELECT pg_get_userbyid(relowner)owner FROM pg_class WHERE oid=to_regclass($1)',[rel]);if(owner.owner!==r.owner)throw Error('Exact original billing owner required');
  }
  for(const r of data.relations){const rel='public.'+q(r.relname);const before=(await db.query('SELECT conname name,pg_get_constraintdef(oid,true)definition FROM pg_constraint WHERE conrelid=to_regclass($1)',[rel])).rows;if(before.some((c:any)=>!r.constraints.some((x:any)=>x.name===c.name&&x.definition===c.definition)))throw Error('Unexpected prerequisite constraint '+r.relname);for(const c of r.constraints || [])if(!before.some((x:any)=>x.name===c.name))await db.exec('ALTER TABLE '+rel+' ADD CONSTRAINT '+q(c.name)+' '+c.definition);}
  for(const f of data.functions) {
   const sig=nativeFunctionSignature(f),prior=await one(db,'SELECT to_regprocedure($1)::text id',[sig]);
   if(f.proname==='is_student_profile'){if(!prior.id)throw Error('Original genuine student predicate required');functions.push({...await verifyNativeFunction(db,f,sig),alreadyPresent:true,bodyNotReplaced:true});continue;}
   if(prior.id&&(await one(db,'SELECT pg_get_functiondef(to_regprocedure($1))definition',[sig])).definition!==f.definition)throw Error('Existing billing function must exactly match capture '+sig);
   if(f.owner!=='postgres'||f.prokind!=='f')throw Error('Exact captured function owner/kind required');
   if(!prior.id)await db.exec(f.definition);
   const grants=(await db.query("SELECT DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC'ELSE pg_get_userbyid(a.grantee)END role FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=to_regprocedure($1)",[sig])).rows;
   for(const g of grants)await db.exec('REVOKE ALL ON FUNCTION '+sig+' FROM '+(g.role==='PUBLIC'?'PUBLIC':q(g.role)));
   for(const acl of f.acl) { const m=/^([^=]*)=X\/postgres$/.exec(acl);if(!m)throw Error('Exact non-grantable captured function ACL required');const role=m[1]||'PUBLIC';if(role!=='PUBLIC'&&!(await one(db,'SELECT 1 n FROM pg_roles WHERE rolname=$1',[role])))throw Error('Captured role must already exist');await db.exec('GRANT EXECUTE ON FUNCTION '+sig+' TO '+(role==='PUBLIC'?'PUBLIC':q(role))); }
   functions.push({...await verifyNativeFunction(db,f,sig,true),alreadyPresent:!!prior.id});
  }
  for(const index of data.indexes) {
   const existing=await one(db,"SELECT indexdef FROM pg_indexes WHERE schemaname='public'AND indexname=$1",[index.name]);
   if(existing&&existing.indexdef!==index.definition)throw Error('Actual billing index mismatch '+index.name);
   if(!existing)await db.exec(index.definition);
  }
  const privileges:any={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN'};
  for(const r of data.relations) {
   const rel='public.'+q(r.relname);
   for(const p of r.policies || []) { const command:any={r:'SELECT',a:'INSERT',w:'UPDATE',d:'DELETE','*':'ALL'};if(!command[p.command])throw Error('Unknown captured policy');await db.exec('CREATE POLICY '+q(p.name)+' ON '+rel+' AS '+(p.permissive?'PERMISSIVE':'RESTRICTIVE')+' FOR '+command[p.command]+' TO '+p.roles.map((role:string)=>role==='PUBLIC'?'PUBLIC':q(role)).join(',')+(p.qual?' USING('+p.qual+')':'')+(p.with_check?' WITH CHECK('+p.with_check+')':'')); }
   for(const t of r.triggers || []){const existing=await one(db,'SELECT pg_get_triggerdef(oid)definition FROM pg_trigger WHERE tgrelid=to_regclass($1)AND tgname=$2',[rel,t.name]);if(existing&&existing.definition!==t.definition)throw Error('Unexpected prerequisite billing trigger');if(!existing)await db.exec(t.definition);}
   await db.exec('ALTER TABLE '+rel+' ENABLE ROW LEVEL SECURITY');
   const grants=(await db.query("SELECT DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC'ELSE pg_get_userbyid(a.grantee)END role FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.oid=to_regclass($1)",[rel])).rows;
   for(const g of grants)await db.exec('REVOKE ALL ON TABLE '+rel+' FROM '+(g.role==='PUBLIC'?'PUBLIC':q(g.role)));
   for(const acl of r.acl) {const m=/^([^=]*)=([arwdDxtm]+)\/postgres$/.exec(acl);if(!m)throw Error('Exact captured table ACL required');const role=m[1]||'PUBLIC';if(role!=='PUBLIC'&&!(await one(db,'SELECT 1 n FROM pg_roles WHERE rolname=$1',[role])))throw Error('Captured role must already exist');await db.exec('GRANT '+[...m[2]].map(x=>privileges[x]).join(',')+' ON TABLE '+rel+' TO '+(role==='PUBLIC'?'PUBLIC':q(role)));}
   const check=await one(db,'SELECT c.relacl::text[]acl,c.relrowsecurity rls,c.relforcerowsecurity force_rls FROM pg_class c WHERE c.oid=to_regclass($1)',[rel]);
   if(JSON.stringify([...(check.acl || [])].sort())!==JSON.stringify([...r.acl].sort())||check.rls!==r.rls||check.force_rls!==r.force_rls)throw Error('Exact captured billing table ACL/RLS required '+r.relname);
   if(JSON.stringify(await rowDigest(rel))!==JSON.stringify(initialRows[r.relname]))throw Error('Prerequisite restoration changed existing monthly accounting or agreements');
   const columns=(await db.query(columnQuery,[rel])).rows;
   if(columns.length!==r.columns.length||columns.some((c:any)=>{const expected=r.columns.find((x:any)=>x.name===c.name);return !expected||['name','type','not_null','default','generated','identity'].some(k=>c[k]!==expected[k]);}))throw Error('Exact billing columns by name required '+r.relname);
   relations.push({name:r.relname,exactColumnsByNameAndFullACL:true,physicalColumnOrdinalParity:columns.every((c:any,i:number)=>c.name===r.columns[i].name),rls:true,existingRowsUnchanged:true,rowCount:initialRows[r.relname].n});
  }
  for(const t of data.triggers) {const old=await one(db,'SELECT pg_get_triggerdef(oid)definition FROM pg_trigger WHERE tgrelid=to_regclass($1)AND tgname=$2',['public.'+t.table,t.name]);if(old&&old.definition!==t.definition)throw Error('Actual original enrollment trigger differs');if(!old)await db.exec(t.definition);const check=await one(db,'SELECT pg_get_triggerdef(oid)definition FROM pg_trigger WHERE tgrelid=to_regclass($1)AND tgname=$2',['public.'+t.table,t.name]);if(check?.definition!==t.definition)throw Error('Exact original enrollment trigger required');triggers.push(t);}
  await db.exec('COMMIT');
 }catch(e){await db.exec('ROLLBACK');throw e;}
 return {status:'PASS',captureSHA256:hash,realQuotaTriggerRestored:true,realPostpaidCaptureTriggerRestored:true,noFakeQuotaOrPostpaidPredicate:true,noCustomerAgreementOrUsageSeeded:true,relations,functions,triggers};
}
