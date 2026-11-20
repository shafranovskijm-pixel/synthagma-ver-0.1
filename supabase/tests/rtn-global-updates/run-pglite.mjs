// Run test-rtn-updates-sql.py --prepare-only first. Local WASM PostgreSQL only;
// this adapter does not claim native multi-session or hosted acceptance.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const out = 'outputs/rtn-updates-sql/';
const db = new PGlite();
let current = '';
try {
  for (const file of ['setup.sql', 'privacy.sql', 'normative.sql', 'guard-drift-setup.sql', 'guard-drift-reject.sql', 'guard-drift-restore.sql', 'candidate.sql', 'acceptance.sql']) {
    current = file;
    const sql = fs.readFileSync(out + file, 'utf8').replaceAll('\r', '')
      .replace('GRANT CREATE ON DATABASE rtn_updates_lab_ci TO postgres;', '');
    if (file === 'guard-drift-reject.sql') {
      let rejected = false;
      try { await db.exec(sql); }
      catch (error) {
        rejected = error.message.includes('RTN_UPDATES_AUTHORITY_PREIMAGE_CHANGED:rtn_private.assert_staff(uuid,text)');
        await db.exec('ROLLBACK;');
        if (!rejected) throw error;
      }
      if (!rejected) throw new Error('Expected authority drift refusal was missing');
    } else await db.exec(sql);
    console.log('OK', file);
  }
  const rows = (await db.query('SELECT name FROM lab.results ORDER BY name')).rows;
  const receipt = { status: 'passed', engine: 'PGlite isolated WASM PostgreSQL', passed: rows.length,
    scope: 'single-connection synthetic ACL/schema/read qualification; not native concurrency or production acceptance', cases: rows.map(row => row.name) };
  fs.writeFileSync(out + 'pglite-result.json', JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, passed: receipt.passed, engine: receipt.engine }));
} catch (error) {
  const receipt = { status: 'failed', file: current, error: error.message, detail: error.detail, where: error.where };
  fs.writeFileSync(out + 'pglite-result.json', JSON.stringify(receipt, null, 2));
  console.error(JSON.stringify(receipt));
  process.exitCode = 1;
} finally {
  await db.close();
}
