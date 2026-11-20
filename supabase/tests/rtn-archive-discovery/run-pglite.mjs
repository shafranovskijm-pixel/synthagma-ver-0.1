// Fresh local WASM PostgreSQL only. No native race/production evidence claim.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const out='outputs/rtn-archive-sql/';
const preimage=process.argv[2]==='--preimage';
const reviewDelta=process.argv[2]==='--review-delta';
if(process.argv.length>((preimage||reviewDelta)?3:2))throw new Error('Unknown local option');
const resultName=reviewDelta?'review-delta-result.json':'pglite-final-result.json';
const db=new PGlite();let current='';
try{
 const files=['setup.sql','privacy.sql','normative.sql','global.sql','auth-fixture.sql','personal.sql','old-news-before.sql','news.sql','backoff.sql','before.sql'];
 if(!preimage)files.push('candidate.sql');
 if(!preimage&&!reviewDelta)files.push('acceptance.sql','review-delta.sql');
 for(const file of files){current=file;const sql=fs.readFileSync(out+file,'utf8').replaceAll('\r','').replace('GRANT CREATE ON DATABASE rtn_archive_lab_ci TO postgres;','');await db.exec(sql);console.log('OK',file);}
 if(reviewDelta){
  current='review-helper-prefix';
  const helpers=fs.readFileSync(out+'acceptance.sql','utf8').split("SELECT lab.check('migration creates exactly seven")[0];
  await db.exec(helpers);
  await db.exec("SET ROLE postgres;SELECT set_config('request.jwt.claim.role','service_role',false);SELECT public.complete_rtn_news_check((lab.ctx('archive_legacy_claim')->>'run_id')::uuid,(lab.ctx('archive_legacy_claim')->>'lease_token')::uuid,lab.ctx('archive_prior_feed'));SELECT lab.keep('archive_base',jsonb_build_object('claim',lab.ctx('archive_legacy_claim'),'payload',lab.ctx('archive_prior_feed')));SELECT lab.archive_anchor(lab.ctx('archive_base'));");
  current='review-delta.sql';await db.exec(fs.readFileSync('supabase/tests/rtn-archive-discovery/review-delta.sql','utf8'));
  const cases=(await db.query('SELECT name FROM lab.results ORDER BY name')).rows.map(row=>row.name);
  if(cases.length!==2)throw new Error('Exactly two new review cases required');
  const receipt={status:'passed',engine:'PGlite fresh synthetic WASM PostgreSQL',passed:2,cases,old58cases_rerun:false,scope:'cross-SCAN duplicate drift and allowed head/boundary revalidation only; no native/production evidence'};
  fs.writeFileSync(out+resultName,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }else if(preimage){
  const rows=(await db.query("SELECT oid::regprocedure::text AS signature,md5(prosrc)body_md5,proacl::text acl,proconfig,provolatile,prosecdef FROM pg_proc WHERE oid IN('rtn_private.enqueue_news_check(text)'::regprocedure,'public.claim_rtn_news_check(uuid)'::regprocedure,'public.complete_rtn_news_check(uuid,uuid,jsonb)'::regprocedure,'rtn_private.news_run_receipt(rtn_private.news_check_runs,boolean)'::regprocedure)ORDER BY signature")).rows;
  fs.writeFileSync(out+'synthetic-preimages.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
 }else{
  const cases=(await db.query('SELECT name FROM lab.results ORDER BY name')).rows.map(r=>r.name);
  const required=['migration changes only four allowed old bodies and preserves all old metadata',
   'unchanged new capture uses older immutable per-item evidence without inventing rows',
   'archive-first URL stays historical on its later genuine fresh-timestamp RSS appearance',
   'inclusive calendar cap stops difference7 as eight DATEs without clamping uncertainty',
   'cross-SCAN repeated URL cannot close a boundary and keeps all page observations',
   'head and boundary revalidation repeats remain valid without unique-budget duplication'];
  if(cases.length<60||new Set(cases).size!==cases.length||required.some(name=>!cases.includes(name)))throw new Error('Required meaningful archive coverage missing');
  const receipt={status:'passed',engine:'PGlite fresh synthetic WASM PostgreSQL',passed:cases.length,cases,scope:'single-connection only; native races, production HTTP/Storage/cron/activation not performed'};
  receipt.migration_sha256=createHash('sha256').update(fs.readFileSync('supabase/migrations/20261121090000_rtn_archive_discovery.sql')).digest('hex');
  fs.writeFileSync(out+resultName,JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,passed:cases.length}));
 }
}catch(error){const receipt={status:'failed',file:current,error:error.message,detail:error.detail,where:error.where};fs.writeFileSync(out+resultName,JSON.stringify(receipt,null,2));console.error(JSON.stringify(receipt));process.exitCode=1;}finally{await db.close();}
