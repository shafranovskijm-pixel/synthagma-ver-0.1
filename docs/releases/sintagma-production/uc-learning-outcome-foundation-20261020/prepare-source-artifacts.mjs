// Author-only fallback for a Python interpreter process crash. Does not execute
// Python, SQL, tests or network calls. The SQL template is existing local source.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const read = filename => readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');
const hash = (kind, value) => createHash(kind).update(value).digest('hex');
const relative = 'supabase/migrations/20261020140000_uc_learning_outcome_foundation.sql';
const sourcePath = path.join(root, relative), source = read(sourcePath);
const sourceSha = hash('sha256', source), sourceMd5 = hash('md5', source);
const predecessors = JSON.parse(read(path.join(root, 'supabase/tests/fixtures/uc-learning-outcomes-erasure-predecessors.json')));
const tables = ['uc_learning_criteria_versions', 'uc_learning_outcome_states', 'uc_learning_attempt_contexts', 'uc_learning_machine_results', 'uc_learning_attestation_decisions', 'uc_learning_outcome_requests'];
const functions = [...source.matchAll(/CREATE FUNCTION public\.(\w+)\(([^\n]*?)\) RETURNS (\w+(?:\.\w+)?) LANGUAGE (\w+)([^$]*?)AS \$fn\$([\s\S]*?)\$fn\$;/g)].map(([,name,params,result,language,options,body]) => {
  const types = params.split(',').filter(arg => arg.trim()).map(arg => arg.trim().replace(/\s+DEFAULT\s+.*$/i, '').replace(/^\S+\s+/, ''));
  const searchPath = options.match(/SET search_path=([a-z_,]+)/)?.[1];
  if (!searchPath) throw new Error('Missing exact search_path');
  return { signature: `public.${name}(${types.join(',')})`, name, return_type: result, language, security_definer: options.includes('SECURITY DEFINER'),
    volatility: options.includes('IMMUTABLE') ? 'i' : options.includes('STABLE') ? 's' : 'v', search_path: 'search_path=' + searchPath.replace(/,/g, ', '), body_md5: hash('md5', body) };
});
if (functions.length !== 26 || new Set(functions.map(f => f.signature)).size !== 26) throw new Error('Exact 26-function inventory missing');
const oldPins = [...source.slice(0, source.indexOf('CREATE TABLE')).matchAll(/\('(public\.[^']+)','([a-f0-9]{32})'\)/g)].map(([,signature,digest]) => ({ signature, source_md5: digest }));
if (oldPins.length !== 16) throw new Error('Exact 16 original-source pins missing');
const payload = JSON.stringify({ new_functions: functions, erasure: predecessors.functions, old_pins: oldPins });
if (payload.includes('$uc014_payload$') || source.includes('$uc014_source$')) throw new Error('SQL delimiter collision');
const template = read(path.join(folder, 'prepare-source-artifacts.py'));
let header = template.match(/header = f"""([\s\S]*?)"""/)?.[1];
const tail = template.match(/tail = """([\s\S]*?)"""/)?.[1];
if (!header || !tail) throw new Error('Authoring template missing');
const replacements = [
  ['{source_sha}', sourceSha], ['{source_md5}', sourceMd5],
  ["{', '.join('public.' + t for t in tables)}", tables.map(t => 'public.' + t).join(', ')],
  ['{payload}', payload], ['{source}', source], ["{','.join(repr(t) for t in tables)}", tables.map(t => "'" + t + "'").join(',')],
];
for (const [needle, value] of replacements) {
  if (header.split(needle).length !== 2) throw new Error('Template placeholder missing/duplicated: ' + needle);
  header = header.replace(needle, () => value);
}
const rollback = header + tables.map(t => `DROP TRIGGER uc_learning_private_history ON public.${t};`).join('\n') + '\n'
  + [...functions].reverse().map(f => `DROP FUNCTION ${f.signature};`).join('\n') + '\n'
  + [...tables].reverse().map(t => `DROP TABLE public.${t};`).join('\n') + tail;
writeFileSync(path.join(folder, 'rollback-empty-foundation.sql'), rollback, 'utf8');
const manifest = { status: 'SOURCE_AUTHORED_NOT_EXECUTED_RELEASE_HELD', base: '04febc6e424e922ed37d1f57f7a5afb0b39361db',
  version: '20261020140000', name: 'uc_learning_outcome_foundation', migration: relative,
  migration_canonical_lf_sha256: sourceSha, migration_canonical_lf_md5: sourceMd5, raw_migration_sha256: hash('sha256', readFileSync(sourcePath)),
  new_tables: tables, new_functions: functions, original_16_source_pins: oldPins, rollback: 'rollback-empty-foundation.sql', rollback_sha256: hash('sha256', rollback),
  execution_count: 0, release_gates: ['UC013 integration/release first', 'independent frozen implementation review', 'coordinated actual focused SQL/UI tests',
    'native PostgreSQL Auth/ACL/default-grant and legacy start/resume/photo/quota/erasure regressions', 'both finite erasure predecessors and empty-only rollback restore',
    'fresh live metadata/ledger baseline and forward version review', 'strict closure build and production browser acceptance'],
  not_claimed: ['UC014 complete roadmap acceptance', 'production deployed', 'test pass', 'native concurrency', 'original N07 or native26', 'legal attestation protocol/commission/signatures', 'legacy issuance replaced'],
  authoring_fallback: 'Node writes already saved Python template as text; no Python execution; original interpreter crash retained separately' };
writeFileSync(path.join(folder, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
process.stdout.write(JSON.stringify({ source_sha256: sourceSha, new_function_count: functions.length, rollback_sha256: manifest.rollback_sha256, execution: 'local source artifact writing only; no database or tests' }) + '\n');
