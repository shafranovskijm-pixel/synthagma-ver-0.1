// Local single-connection WASM qualification, not managed/native acceptance.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const out = 'outputs/rtn-news-ingestion-sql/';
const db = new PGlite();let current = '';
try {
  for (const file of ['setup.sql','privacy.sql','normative.sql','global.sql','auth-fixture.sql','personal.sql','before.sql','reader-drift-setup.sql','reader-drift-reject.sql','reader-drift-restore.sql','notification-drift-setup.sql','notification-drift-reject.sql','notification-drift-restore.sql','bucket-setup.sql','bucket-reject.sql','bucket-restore.sql','news.sql','acceptance.sql','review-delta.sql']) {
    current = file;
    const sql = fs.readFileSync(out + file, 'utf8').replaceAll('\r','').replace('GRANT CREATE ON DATABASE rtn_news_lab_ci TO postgres;', '');
    const refusals = { 'bucket-reject.sql': 'RTN_NEWS_PRIVATE_ORIGINAL_BUCKET_REQUIRED', 'reader-drift-reject.sql': 'RTN_NEWS_READER_PREIMAGE_CHANGED:public.get_rtn_update_summary', 'notification-drift-reject.sql': 'RTN_NEWS_READER_PREIMAGE_CHANGED:public.get_my_rtn_notifications' };
    if (refusals[file]) {
      let refused=false;
      try { await db.exec(sql); }
      catch(error) { refused=error.message.includes(refusals[file]);await db.exec('ROLLBACK;');if(!refused) throw error; }
      if(!refused) throw new Error('Expected exact precondition refusal was missing');
    } else await db.exec(sql);
    console.log('OK', file);
  }
  const cases = (await db.query('SELECT name FROM lab.results ORDER BY name')).rows.map(row => row.name);
  const receipt = { status: 'passed', engine: 'PGlite isolated WASM PostgreSQL', passed: cases.length, cases,
    scope: 'post1400 composition single-connection synthetic SQL only; no native races, production, source fetch, Storage or cron acceptance' };
  fs.writeFileSync(out + 'pglite-result.json', JSON.stringify(receipt,null,2));console.log(JSON.stringify({ status: receipt.status, passed: receipt.passed, engine: receipt.engine }));
} catch (error) {
  const receipt = { status: 'failed', file: current, error: error.message, detail: error.detail, where: error.where };
  fs.writeFileSync(out + 'pglite-result.json', JSON.stringify(receipt,null,2));console.error(JSON.stringify(receipt));process.exitCode=1;
} finally { await db.close(); }
