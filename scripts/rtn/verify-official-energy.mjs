// Independent reconciliation against a lossless openpyxl parse, not a generated implementation mirror.
// Usage: node --experimental-strip-types scripts/rtn/verify-official-energy.mjs source.xlsx canonical/banks
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { validateInflatedXlsx, sha256 } from '../../supabase/functions/_shared/rtn/official-source.ts';
import { normalizeEnergy } from '../../supabase/functions/_shared/rtn/energy-bank.ts';

const [source, canonicalDirectory] = process.argv.slice(2);
if (!source || !canonicalDirectory) throw new Error('Pass source.xlsx and independently parsed canonical banks directory');
const bytes = new Uint8Array(await fs.readFile(source));
await validateInflatedXlsx(bytes);
const sourceSha = await sha256(bytes);
const workbook = XLSX.read(bytes, { type: 'array', cellNF: true, cellText: true, cellDates: false, bookVBA: false, WTF: true });
const banks = await normalizeEnergy(workbook, sourceSha);
const files = (await fs.readdir(canonicalDirectory)).filter(name => name.endsWith('.json')).sort();
assert.equal(files.length, banks.length);
let questions = 0, options = 0;
for (let i = 0; i < banks.length; i++) {
  const expected = JSON.parse(await fs.readFile(path.join(canonicalDirectory, files[i]), 'utf8'));
  const actual = banks[i];
  assert.equal(actual.code, `ENERGY-${expected.sourceSheet}`);
  assert.equal(actual.title, expected.category);
  assert.equal(actual.questions.length, expected.questions.length);
  for (let n = 0; n < expected.questions.length; n++) {
    const a = actual.questions[n], e = expected.questions[n];
    assert.deepEqual([a.id, a.number, a.text, a.source.row], [e.id, e.number, e.text, e.source.questionRow], `${actual.code} question ${n}`);
    assert.deepEqual(a.options.map(o => [o.id, o.text, o.source.row, o.source_value]), e.options.map(o => [o.id, o.text, o.sourceRow, o.sourceValue]), `${actual.code} options ${n}`);
    assert.equal(a.applicability.length, e.applicability.length);
    const marks = xs => xs.map(m => [m.raw, m.dimension, m.value, m.included]);
    assert.deepEqual(marks(a.applicability), marks(e.applicability));
    assert.deepEqual(a.options.map(o => marks(o.applicability)), e.options.map(o => marks(o.applicability)));
    assert.equal(a.section?.text, e.section?.text);
    options += a.options.length; questions++;
  }
}
process.stdout.write(JSON.stringify({ status: 'PASS', sourceSha, banks: banks.length, questions, options, compared: 'All question/option IDs, exact XML text, order, numbers, raw option values, source rows, section text and every applicability value', keys: 0 }) + '\n');
