/** Genuine current622/K plus original provider Auth metadata in isolated PostgreSQL. No S3 or production actions. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture as genuine, caller, one, lo, sha, dataDigests, metadata } from '../education-issuance/education-issuance.fixture';
import { installActualFrdoNativeRuntime } from '../frdo-packets/frdo-packets.actual-runtime';
import { installActualRemovalReaders } from '../erroneous-course-removal/erroneous-course-removal.actual-readers';
import { installActualRemovalBilling } from '../erroneous-course-removal/erroneous-course-removal.actual-billing';
import{installActualER624Authority}from'./signature-assurance.actual624-authority';
export { caller, one, lo, sha, dataDigests, metadata };
export async function installCommittedER624(c:any) {
 const db = c.db;
 try {
  await db.exec('RESET ROLE');
  const actualRuntime = await installActualFrdoNativeRuntime(db);
  writeFileSync(join(process.env.UC116_NATIVE_OUTPUT!, 'removal-actual-runtime-'+db.native.name+'.json'), JSON.stringify(actualRuntime,null,2)+'\n');
  const readerRuntime = await installActualRemovalReaders(db);
  writeFileSync(join(process.env.UC116_NATIVE_OUTPUT!, 'removal-actual-readers-'+db.native.name+'.json'), JSON.stringify(readerRuntime,null,2)+'\n');
  const billingRuntime = await installActualRemovalBilling(db);
  writeFileSync(join(process.env.UC116_NATIVE_OUTPUT!, 'removal-actual-billing-'+db.native.name+'.json'), JSON.stringify(billingRuntime,null,2)+'\n');
  const contract = JSON.parse(readFileSync(join(process.env.UC116_NATIVE_PROFILE!, 'profile-contract.json'),'utf8'));
  const committedAD01=readFileSync(contract.committedAD01.path,'utf8');if(sha(committedAD01)!==contract.committedAD01.sha256)throw Error('Exact committed623 AD01 required');await db.exec(committedAD01);
  const raw = readFileSync(contract.erroneousRemovalSource.path,'utf8');
  if (sha(raw) !== contract.erroneousRemovalSource.sha256) throw Error('Exact reviewed removal SQL required');
  await installActualER624Authority(db,contract);
  const beforeData = await dataDigests(db), beforeMeta = await metadata(db);
  await db.exec('BEGIN'); try { await db.exec(raw); } finally { await db.exec('ROLLBACK'); }
  if (JSON.stringify(await dataDigests(db)) !== JSON.stringify(beforeData) || JSON.stringify(await metadata(db)) !== JSON.stringify(beforeMeta)) throw Error('Removal SQL rollback did not preserve baseline');
  await db.exec('BEGIN'); try { await db.exec(raw); await db.exec('COMMIT'); } catch (e) { await db.exec('ROLLBACK'); throw e; }
  const actualPostRaw=readFileSync(contract.actual624Postimages.path,'utf8');if(sha(actualPostRaw)!==contract.actual624Postimages.sha256)throw Error('Fresh actual624 postimage capture drift');const actualPost=JSON.parse(actualPostRaw);if(actualPost.rows.length!==15)throw Error('Exact actual624 fifteen functions required');const normalizeAcl=(x:string|null)=>(x??'{}').slice(1,-1).split(',').filter(Boolean).sort();const postComparisons:any[]=[];for(const f of actualPost.rows){const now=await one<any>(db,"SELECT md5(p.prosrc)body_md5,p.proacl::text acl,p.prosecdef,p.provolatile,p.proconfig,pg_get_userbyid(p.proowner)owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=$1 AND pg_get_function_identity_arguments(p.oid)=$2",[f.proname,f.identity_arguments]);const mismatch=!now?['function_absent']:['body_md5','prosecdef','provolatile','proconfig','owner'].filter(k=>JSON.stringify(now[k])!==JSON.stringify(f[k]));if(now&&JSON.stringify(normalizeAcl(now.acl))!==JSON.stringify(normalizeAcl(f.acl)))mismatch.push('directACL');postComparisons.push({name:f.proname,expected:{body_md5:f.body_md5,acl:f.acl,prosecdef:f.prosecdef,provolatile:f.provolatile,proconfig:f.proconfig,owner:f.owner},actual:now,mismatch});}const postMismatches=postComparisons.filter(x=>x.mismatch.length);writeFileSync(join(process.env.UC116_NATIVE_OUTPUT!,'actual624-postimage-check.json'),JSON.stringify({status:postMismatches.length?'FAIL':'PASS',captureSHA256:sha(actualPostRaw),exact15BodiesOwnerConfigFlagsAndDirectACL:postMismatches.length===0,comparisons:postComparisons,stage:'Before composed S3',productionClaim:false},null,2)+'\n');if(postMismatches.length)throw Error('Fresh actual624 full postimage mismatches '+postMismatches.map(x=>x.name+':'+x.mismatch.join(',')).join(';'));
  const afterData = await dataDigests(db), afterMeta = await metadata(db);
  for (const [name,value] of Object.entries(beforeData)) if (JSON.stringify(afterData[name]) !== JSON.stringify(value)) throw Error('Removal append changed old rowset '+name);
  const added = Object.keys(afterData).filter(k => !(k in beforeData));
  if (JSON.stringify(added.sort()) !== JSON.stringify(['public.uc_course_assignment_removal_events'])) throw Error('Exactly one new removal table required');
  const permitted = contract.erroneousRemovalChangedOldFunctions as string[];
  if (!Array.isArray(permitted) || permitted.length !== 11) throw Error('Exact eleven old function changes required');
  for (const previous of beforeMeta.functions) {
   const next = afterMeta.functions.find((f:any) => f.signature === previous.signature);
   if (!next || JSON.stringify(previous.metadata) !== JSON.stringify(next.metadata)) throw Error('Old function authority changed '+previous.signature);
   if (previous.source_md5 !== next.source_md5 && !permitted.includes(previous.signature)) throw Error('Unreviewed function body change '+previous.signature);
  }
  const changedActual = beforeMeta.functions.filter((f:any) => f.source_md5 !== afterMeta.functions.find((g:any) => g.signature === f.signature)?.source_md5).map((f:any) => f.signature).sort();
  if (JSON.stringify(changedActual) !== JSON.stringify([...permitted].sort())) throw Error('Exact eleven changed old functions expected');
  for (const key of ['roles','defaults','memberships','settings']) if (JSON.stringify(beforeMeta[key]) !== JSON.stringify(afterMeta[key])) throw Error('Old authority changed '+key);
  const fresh = afterMeta.functions.filter((f:any) => !beforeMeta.functions.some((g:any) => g.signature === f.signature));
  if (fresh.length !== 4) throw Error('Exactly four new removal functions expected');
  for (const f of fresh) {
   const exposed = /^(read_course_assignment_removal|remove_erroneous_course_assignment)\(/.test(f.signature);
   const expected = ['postgres=X/postgres', ...(exposed ? ['authenticated=X/postgres'] : [])].sort();
   if (JSON.stringify([...(f.metadata.proacl || [])].sort()) !== JSON.stringify(expected)) throw Error('Unexpected removal function ACL '+f.signature);
  }
  const acl = await one<any>(db, "SELECT c.relrowsecurity r,EXISTS(SELECT 1 FROM unnest(ARRAY['authenticated','anon','service_role'])a WHERE has_table_privilege(a,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')OR has_any_column_privilege(a,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))exposed FROM pg_class c WHERE c.oid='public.uc_course_assignment_removal_events'::regclass");
  if (!acl.r || acl.exposed || (await one<any>(db,'SELECT count(*)::int n FROM uc_course_assignment_removal_events')).n !== 0) throw Error('Private empty removal event table required');
  const preservation = { status:'PASS', exactReviewedSource:true, rollbackPreserved:true, allOldRowsetsUnchanged:true, exactOnePrivateEmptyTable:true, exactFourNewPrivateFunctions:true, exactElevenOldBodiesOnly:true, oldFunctionAuthorityUnchanged:true, rolesDefaultsMembershipsSettingsUnchanged:true, originalAuthRuntimeExact:true, exactActualReaderBaseline:true, exactActualBillingBaseline:true, rawSHA256:sha(raw), changedActual, newFunctions:fresh.map((f:any)=>f.signature), nativeAuthHttp:false, productionWrites:false };
  writeFileSync(join(process.env.UC116_NATIVE_OUTPUT!, 'erroneous-removal-preservation.json'), JSON.stringify(preservation,null,2)+'\n');
  async function read(enrollment=c.enrollment, group:null|string=null, org=lo.org) { return (await one<any>(db,'SELECT read_course_assignment_removal($1,$2,$3)d',[org,group,enrollment])).d; }
  async function remove(ref:any, request=randomUUID()) { return (await one<any>(db,'SELECT remove_erroneous_course_assignment($1,$2,$3,$4,$5)d',[ref.organization_id,ref.group_id,ref.enrollment_id,ref.state_hash,request])).d; }
  async function authenticatedUpdate(enrollment=c.enrollment) { return await one<any>(db,"UPDATE enrollments SET status='active'WHERE id=$1 RETURNING *",[enrollment]); }
  await caller(db,lo.owner);
  return { ...c, contract, preservation, actualRuntime, readerRuntime, billingRuntime, read, remove, authenticatedUpdate };
 } catch(e) { await db.close(); throw e; }
}
