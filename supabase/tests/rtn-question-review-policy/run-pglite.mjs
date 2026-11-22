// Local disposable WASM PostgreSQL only; never native concurrency/source proof.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const out = 'outputs/rtn-question-policy-sql/';
const preflight = process.argv[2] === '--preflight-only';
const delta = process.argv[2] === '--delta-only';
if (process.argv.length > (preflight || delta ? 3 : 2)) throw new Error('Unknown lab option');
const db = new PGlite(); let current = '';
try {
  const files = ['setup.sql', 'privacy.sql', 'old-seed.sql', 'normative.sql', 'global.sql', 'backoff.sql', 'before.sql', 'candidate.sql'];
  if (!preflight && !delta) files.push('acceptance.sql', 'release-transition-delta.sql');
  for (const file of files) {
    current = file;
    if (file !== 'setup.sql') await db.exec("SET ROLE postgres;SELECT set_config('request.jwt.claim.role','',false);SELECT set_config('request.jwt.claim.sub','',false);");
    await db.exec(fs.readFileSync(out + file, 'utf8').replaceAll('\r', '').replace('GRANT CREATE ON DATABASE rtn_question_policy_lab_ci TO postgres;', ''));
    console.log('OK', file);
  }
  if (delta) {
    current = 'new-helper-prefix';
    const helpers = fs.readFileSync(out + 'acceptance.sql', 'utf8').split("SELECT lab.check('policy migration changes only six reviewed bodies")[0];
    await db.exec(helpers);
    current = 'release-transition-delta.sql';
    await db.exec(fs.readFileSync(out + current, 'utf8'));
  }
  await db.exec('SET ROLE postgres;');
  const post = (await db.query("SELECT p.oid::regprocedure::text signature,md5(prosrc) body_md5 FROM pg_proc p WHERE p.oid IN('public.get_rtn_workspace(uuid)'::regprocedure,'public.get_rtn_editorial_workspace()'::regprocedure,'rtn_private.normative_current(uuid,timestamptz)'::regprocedure) ORDER BY signature")).rows;
  const cases = preflight ? [] : (await db.query('SELECT name FROM lab.results ORDER BY name')).rows.map(row => row.name);
  if (!preflight && cases.length !== (delta ? 1 : 27)) throw new Error('Missing meaningful policy cases');
  const receipt = { status: preflight ? 'installed_in_disposable_wasm_only' : 'passed', engine: 'PGlite isolated synthetic WASM PostgreSQL',
    passed: cases.length, cases, synthetic_postimages: post,
    migration_sha256: createHash('sha256').update(fs.readFileSync('supabase/migrations/20261122100000_rtn_question_review_policy_v2.sql')).digest('hex'),
    scope: 'No native sessions/races, actual schema, official source HTTP or production data.' };
  const name = preflight ? 'preflight-result.json' : delta ? 'pglite-transition-delta-result.json' : 'pglite-result.json';
  fs.writeFileSync(out + name, JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt));
} catch (error) {
  const receipt = { status: 'failed', file: current, error: error.message, detail: error.detail, where: error.where,
    position: error.position, internalPosition: error.internalPosition, internalQuery: error.internalQuery };
  fs.writeFileSync(out + (preflight ? 'preflight-result.json' : delta ? 'pglite-transition-delta-result.json' : 'pglite-result.json'), JSON.stringify(receipt, null, 2));
  console.error(JSON.stringify(receipt)); process.exitCode = 1;
} finally { await db.close(); }
