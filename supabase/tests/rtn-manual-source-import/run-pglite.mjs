// Single-connection WASM fixture; no production, real file or HTTP operation.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const out='outputs/rtn-manual-source-import-sql/';
const db=new PGlite();let current='';
try {
 for(const file of ['setup.sql','privacy.sql','old-seed.sql','normative.sql','global.sql','backoff.sql','policy.sql','manual-backoff.sql','before.sql','known-extraction.sql','candidate.sql','acceptance.sql']) {
  current=file;
  if(file!=='setup.sql')await db.exec("SET ROLE postgres;SELECT set_config('request.jwt.claim.role','',false);SELECT set_config('request.jwt.claim.sub','',false);");
  await db.exec(fs.readFileSync(out+file,'utf8').replaceAll('\r','').replace('GRANT CREATE ON DATABASE rtn_manual_source_import_lab_ci TO postgres;',''));
  console.log('OK',file);
 }
 await db.exec('SET ROLE postgres;');
 const cases=(await db.query('SELECT name FROM lab.results ORDER BY name')).rows.map(x=>x.name);
 if(cases.length<20)throw new Error('Missing meaningful import cases');
 const post=(await db.query("SELECT p.oid::regprocedure::text signature,md5(p.prosrc)body_md5,pg_get_userbyid(p.proowner)owner,p.proacl::text acl,p.proconfig,p.prosecdef,p.provolatile FROM pg_proc p WHERE p.oid IN('public.get_rtn_workspace(uuid)'::regprocedure,'public.get_rtn_editorial_workspace()'::regprocedure,'rtn_private.assert_manual_import_actor(uuid)'::regprocedure,'rtn_private.manual_source_intake_receipt(uuid,boolean)'::regprocedure,'public.finalize_rtn_manual_source_import(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb)'::regprocedure)ORDER BY signature")).rows;
 const receipt={status:'passed',engine:'PGlite single-connection synthetic WASM PostgreSQL',passed:cases.length,cases,function_postimages:post,
  migration_sha256:createHash('sha256').update(fs.readFileSync('supabase/migrations/20261123100000_rtn_manual_source_import.sql')).digest('hex'),
  scope:'No actual stored bytes, native waits, official HTTP, genuine user or Techservice acceptance.'};
 fs.writeFileSync(out+'pglite-result.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}catch(error){const receipt={status:'failed',file:current,error:error.message,detail:error.detail,where:error.where,position:error.position};fs.writeFileSync(out+'pglite-result.json',JSON.stringify(receipt,null,2));console.error(JSON.stringify(receipt));process.exitCode=1;}finally{await db.close();}
