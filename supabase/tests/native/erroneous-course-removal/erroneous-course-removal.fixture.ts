/** Genuine current622/K plus original provider Auth metadata in isolated PostgreSQL. No S3 or production actions. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture as genuine, caller, one, lo, sha, dataDigests, metadata } from '../education-issuance/education-issuance.fixture';
import { installActualFrdoNativeRuntime } from '../frdo-packets/frdo-packets.actual-runtime';
import { installActualRemovalReaders } from './erroneous-course-removal.actual-readers';
import { installActualRemovalBilling } from './erroneous-course-removal.actual-billing';
export { caller, one, lo, sha, dataDigests, metadata };
export async function fixture() {
 const c = await genuine(), db = c.db;
 try {
  await db.exec('RESET ROLE');
  const actualRuntime = await installActualFrdoNativeRuntime(db);
  writeFileSync(join(process.env.UC116_NATIVE_OUTPUT!, 'removal-actual-runtime-'+db.native.name+'.json'), JSON.stringify(actualRuntime,null,2)+'\n');
  const readerRuntime = await installActualRemovalReaders(db);
  writeFileSync(join(process.env.UC116_NATIVE_OUTPUT!, 'removal-actual-readers-'+db.native.name+'.json'), JSON.stringify(readerRuntime,null,2)+'\n');
  const billingRuntime = await installActualRemovalBilling(db);
  writeFileSync(join(process.env.UC116_NATIVE_OUTPUT!, 'removal-actual-billing-'+db.native.name+'.json'), JSON.stringify(billingRuntime,null,2)+'\n');
  const contract = JSON.parse(readFileSync(join(process.env.UC116_NATIVE_PROFILE!, 'profile-contract.json'),'utf8'));
  const raw = readFileSync(contract.erroneousRemovalSource.path,'utf8');
  if (sha(raw) !== contract.erroneousRemovalSource.sha256) throw Error('Exact reviewed removal SQL required');
  const beforeData = await dataDigests(db), beforeMeta = await metadata(db);
  await db.exec('BEGIN'); try { await db.exec(raw); } finally { await db.exec('ROLLBACK'); }
  if (JSON.stringify(await dataDigests(db)) !== JSON.stringify(beforeData) || JSON.stringify(await metadata(db)) !== JSON.stringify(beforeMeta)) throw Error('Removal SQL rollback did not preserve baseline');
  await db.exec('BEGIN'); try { await db.exec(raw); await db.exec('COMMIT'); } catch (e) { await db.exec('ROLLBACK'); throw e; }
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
