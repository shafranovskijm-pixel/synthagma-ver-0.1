// Single-connection WASM checks only; actual source-row waits run in PG17 CI.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const out = 'outputs/rtn-manual-source-backoff-sql/';
const db = new PGlite(); let current = '';
try {
  for (const file of ['setup.sql','privacy.sql','old-seed.sql','normative.sql','global.sql','backoff.sql','policy.sql','before.sql','candidate.sql','acceptance.sql']) {
    current = file;
    const sql = fs.readFileSync(out + file, 'utf8').replaceAll('\r', '')
      .replace('GRANT CREATE ON DATABASE rtn_manual_source_backoff_lab_ci TO postgres;', '');
    await db.exec(sql); console.log('OK', file);
  }
  const cases = (await db.query('SELECT name FROM lab.results ORDER BY name')).rows.map(row => row.name);
  if (cases.length < 28) throw new Error('Missing manual backoff acceptance cases');
  const postimage = (await db.query("SELECT md5(prosrc)body_md5 FROM pg_proc WHERE oid='public.get_rtn_workspace(uuid)'::regprocedure")).rows[0];
  const receipt = { status: 'passed', engine: 'PGlite isolated WASM PostgreSQL', passed: cases.length, cases, workspace_postimage: postimage,
    scope: 'new single-connection synthetic manual backoff/ACL/DTO tests only; stale transaction clock is tested, real lock waits require separate PG17 runner; no sourceHTTP/productionSQL/pilot proof' };
  fs.writeFileSync(out + 'pglite-result.json', JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, passed: receipt.passed, engine: receipt.engine }));
} catch (error) {
  const receipt = { status: 'failed', file: current, error: error.message, detail: error.detail, where: error.where };
  fs.writeFileSync(out + 'pglite-result.json', JSON.stringify(receipt, null, 2));
  console.error(JSON.stringify(receipt)); process.exitCode = 1;
} finally { await db.close(); }
