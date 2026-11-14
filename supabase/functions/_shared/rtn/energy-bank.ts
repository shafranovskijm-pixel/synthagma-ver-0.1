import { sha256 } from './official-source.ts';

export type WorkbookCell = { v?: unknown; w?: string; z?: string; f?: string };
export type EnergyWorkbook = { SheetNames: string[]; Sheets: Record<string, Record<string, WorkbookCell | string | unknown>> };
type Provenance = { sheet: string; row: number; cell: string; workbook_sha256: string };
export type OfficialQuestion = {
  id: string; number: number; text: string;
  options: { id: string; text: string; source: Provenance; applicability: unknown[]; source_value: unknown; number_format?: string }[];
  source: Provenance; section: { text: string; row: number } | null; applicability: unknown[];
};
export type NormalizedBank = { code: string; title: string; domain: string; questions: OfficialQuestion[] };

const dimensions = [
  ['C', 'voltage', 'up_to_1000_v'], ['D', 'voltage', 'up_to_and_above_1000_v'],
  ['E', 'electrical_safety_group', 'II'], ['F', 'electrical_safety_group', 'III'],
  ['G', 'electrical_safety_group', 'IV'], ['H', 'electrical_safety_group', 'V'],
] as const;

function raw(sheet: EnergyWorkbook['Sheets'][string], address: string): WorkbookCell | undefined {
  const cell = sheet[address];
  if (!cell || typeof cell !== 'object') return undefined;
  if ('f' in cell && cell.f) throw new Error('ENERGY_FORMULA_REQUIRES_REVIEW');
  return cell as WorkbookCell;
}
// XML 1.0 line endings: SheetJS expands some shared-string LF to CRLF; use the
// XML text value shared by independent OOXML parsers. Never trim/change words.
function xmlText(value: string): string { return value.replace(/\r\n?/g, '\n'); }
function value(sheet: EnergyWorkbook['Sheets'][string], address: string): unknown {
  const v = raw(sheet, address)?.v;
  return typeof v === 'string' ? xmlText(v) : v;
}
function marks(sheet: EnergyWorkbook['Sheets'][string], row: number) {
  return dimensions.flatMap(([column, dimension, val]) => {
    const v = value(sheet, `${column}${row}`);
    return v == null || v === '' ? [] : [{ cell: `${column}${row}`, raw: v, dimension, value: val, included: v === '+' ? true : null }];
  });
}
function display(cell: WorkbookCell): string {
  if (typeof cell.v === 'string') return xmlText(cell.v);
  if (typeof cell.v !== 'number' || !Number.isFinite(cell.v)) throw new Error('ENERGY_UNSUPPORTED_CELL');
  if (!cell.z || cell.z === 'General') return String(cell.v);
  if (cell.z === '0%' && Number.isInteger(cell.v * 100)) return `${cell.v * 100}%`;
  throw new Error('ENERGY_UNREVIEWED_NUMBER_FORMAT');
}

/** Layout drift is a failed normalization, never an empty or silently shortened bank. */
export async function normalizeEnergy(workbook: EnergyWorkbook, sourceSha: string): Promise<NormalizedBank[]> {
  if (!/^[0-9a-f]{64}$/.test(sourceSha) || !workbook.SheetNames.length || workbook.SheetNames.length > 30) throw new Error('ENERGY_INVALID_WORKBOOK');
  const banks: NormalizedBank[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error('ENERGY_MISSING_SHEET');
    const addresses = Object.keys(sheet).filter(key => !key.startsWith('!'));
    if (addresses.length > 200_000 || addresses.some(key => !/^[A-Z]{1,3}[1-9][0-9]{0,5}$/.test(key))) throw new Error('ENERGY_CELL_LIMIT');
    const rows = new Set<number>();
    for (const address of addresses) {
      // Validate even cells outside text columns; no formula is allowed in an official question import.
      raw(sheet, address);
      if (!/^[A-H]\d+$/.test(address) && value(sheet, address) != null && value(sheet, address) !== '') throw new Error('ENERGY_UNKNOWN_POPULATED_COLUMN');
      rows.add(Number(address.match(/\d+$/)![0]));
    }
    const title = value(sheet, 'B1');
    if (typeof title !== 'string' || !title.trim()) throw new Error('ENERGY_CATEGORY_HEADER_MISSING');
    let question: OfficialQuestion | null = null;
    let section: OfficialQuestion['section'] = null;
    const questions: OfficialQuestion[] = [];
    function finish() {
      if (!question) return;
      if (question.options.length < 2 || question.options.length > 30) throw new Error('ENERGY_INCOMPLETE_QUESTION');
      questions.push(question);
      question = null;
    }
    for (const row of [...rows].sort((a, b) => a - b)) {
      const a = value(sheet, `A${row}`), b = value(sheet, `B${row}`);
      if (row === 1 || (row === 2 && a == null && b == null)) continue;
      if (a == null && b == null) {
        if (dimensions.some(([col]) => value(sheet, `${col}${row}`) != null)) throw new Error('ENERGY_ORPHAN_APPLICABILITY');
        continue;
      }
      if (typeof a === 'string') { finish(); section = { text: a, row }; continue; }
      const source = { sheet: name, row, cell: `B${row}`, workbook_sha256: sourceSha };
      if (typeof a === 'number') {
        finish();
        if (!Number.isInteger(a) || a < 1 || typeof b !== 'string' || !b.trim()) throw new Error('ENERGY_INVALID_QUESTION');
        question = {
          id: await sha256(new TextEncoder().encode(JSON.stringify([sourceSha, name, row, 'question']))),
          number: a, text: b, source, section, applicability: marks(sheet, row), options: [],
        };
      } else if (a == null && b != null) {
        if (!question) throw new Error('ENERGY_ORPHAN_OPTION');
        const cell = raw(sheet, `B${row}`)!;
        question.options.push({
          id: await sha256(new TextEncoder().encode(JSON.stringify([sourceSha, name, row, 'option']))),
          text: display(cell), source, source_value: b, number_format: cell.z, applicability: marks(sheet, row),
        });
      } else throw new Error('ENERGY_UNCLASSIFIED_ROW');
    }
    finish();
    if (!questions.length) throw new Error('ENERGY_EMPTY_BANK');
    banks.push({ code: `ENERGY-${name}`, title, domain: 'energy_supervision_knowledge_check', questions });
  }
  return banks;
}
