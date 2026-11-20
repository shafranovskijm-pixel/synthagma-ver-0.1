// Isolated in-memory PostgreSQL only. Does not claim real multi-session races.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const out='outputs/rtn-personal-sql/';
const delta=process.argv[2]==='--preauthorization-delta';
if(process.argv.length>(delta?3:2)) throw new Error('Unknown qualification option');
const db=new PGlite();
let current='';
try {
 const files=delta
  ? ['setup.sql','privacy.sql','normative.sql','global.sql','auth-fixture.sql','before-candidate.sql','candidate.sql','preauthorization-delta.sql']
  : ['setup.sql','privacy.sql','normative.sql','global.sql','auth-fixture.sql','guard-drift-setup.sql','guard-drift-reject.sql','guard-drift-restore.sql','before-candidate.sql','candidate.sql','acceptance.sql','scope-acceptance.sql','preauthorization-delta.sql'];
 for(const file of files) {
  current=file;
  const sql=fs.readFileSync(out+file,'utf8').replaceAll('\r','').replace('GRANT CREATE ON DATABASE rtn_personal_lab_ci TO postgres;','');
  if(file==='guard-drift-reject.sql') {
   let rejected=false;
   try { await db.exec(sql); }
   catch(error) {
    rejected=error.message.includes('RTN_PERSONAL_AUTHORITY_PREIMAGE_CHANGED:rtn_private.personal_counts(uuid)');
    await db.exec('ROLLBACK;');
    if(!rejected)throw error;
   }
   if(!rejected)throw new Error('Expected personal authority drift refusal missing');
  } else await db.exec(sql);
  console.log('OK',file);
 }
 const rows=(await db.query('SELECT name FROM lab.results ORDER BY name')).rows;
 const receipt={status:'passed',engine:'PGlite isolated WASM PostgreSQL',passed:rows.length,
  scope:delta?'single new preauthorization rejection case only; no previous passing cases replayed; native lock-boundary proof remains pending':'single-connection synthetic personal schema/ACL/RPC/privacy qualification; native concurrency remains separate',cases:rows.map(row=>row.name)};
 fs.writeFileSync(out+(delta?'preauthorization-delta-result.json':'pglite-result.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({status:receipt.status,passed:receipt.passed,engine:receipt.engine}));
}catch(error) {
 const receipt={status:'failed',file:current,error:error.message,detail:error.detail,where:error.where};
 fs.writeFileSync(out+(delta?'preauthorization-delta-result.json':'pglite-result.json'),JSON.stringify(receipt,null,2));
 console.error(JSON.stringify(receipt));process.exitCode=1;
}finally { await db.close(); }
