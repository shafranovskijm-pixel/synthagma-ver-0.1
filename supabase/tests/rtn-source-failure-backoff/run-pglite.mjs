// Isolated single-connection WASM qualification, never managed/native SQL.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const out = 'outputs/rtn-source-backoff-sql/';
const db = new PGlite();let current = '';
try {
  for (const file of ['setup.sql','privacy.sql','normative.sql','before.sql','authority-drift.sql','authority-reject.sql','authority-restore.sql','body-drift.sql','body-reject.sql','body-restore.sql','candidate.sql','repeat-reject.sql','acceptance.sql']) {
    current = file;
    const sql = fs.readFileSync(out + file, 'utf8').replaceAll('\r','').replace('GRANT CREATE ON DATABASE rtn_source_backoff_lab_ci TO postgres;', '');
    if (file.endsWith('-reject.sql')) {
      let refused = false;
      try { await db.exec(sql); }
      catch (error) { refused = error.message.includes('RTN_SOURCE_RETRY_PREIMAGE_OR_AUTHORITY_CHANGED');await db.exec('ROLLBACK;');if (!refused) throw error; }
      if (!refused) throw new Error('Expected exact preimage refusal was missing');
    } else await db.exec(sql);
    console.log('OK', file);
  }
  const cases = (await db.query('SELECT name FROM lab.results ORDER BY name')).rows.map(row => row.name);
  const postimage = (await db.query("SELECT p.oid,md5(p.prosrc)body_md5,pg_get_userbyid(p.proowner)owner,p.proacl::text acl,p.proconfig,p.prosecdef,p.provolatile FROM pg_proc p WHERE oid='public.enqueue_due_rtn_checks()'::regprocedure")).rows[0];
  const receipt = { status: 'passed', engine: 'PGlite isolated WASM PostgreSQL', passed: cases.length, cases, synthetic_postimage: postimage,
    scope: 'single-connection synthetic scheduler/backoff/authority/date cases, not native races/source fetch/cron or actual schema acceptance' };
  fs.writeFileSync(out + 'pglite-result.json', JSON.stringify(receipt, null, 2));console.log(JSON.stringify({ status: receipt.status, passed: receipt.passed, engine: receipt.engine, postimage_body_md5: postimage.body_md5 }));
} catch (error) {
  const receipt = { status: 'failed', file: current, error: error.message, detail: error.detail, where: error.where };
  fs.writeFileSync(out + 'pglite-result.json', JSON.stringify(receipt, null, 2));console.error(JSON.stringify(receipt));process.exitCode = 1;
} finally { await db.close(); }
