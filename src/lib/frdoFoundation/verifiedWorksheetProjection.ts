import { BOUNDS, refuse, utf8 } from './hash';
import { OFFICIAL_TEMPLATES } from './officialMetadata';
import type { Stream } from './types';

/** A bounded DOM read window, not a generic XML parser or authority check.
 * Use ONLY after the donor/part hashes, or whole output-to-expected byte comparison.
 * The original complete XML/ZIP is retained unchanged; omitted rows are never omitted
 * from that byte comparison. Every actual written cell is later checked in a window. */
export const VERIFIED_WORKSHEET_WINDOW_ROWS = 32;
export interface VerifiedWorksheetProjection {
 readonly rowCount: number;
 project(firstDataRow?: number, count?: number): string;
}
export function indexVerifiedWorksheet(text: string, stream: Stream): VerifiedWorksheetProjection {
 utf8(text, BOUNDS.xmlBytes);
 if (/<!DOCTYPE|<!ENTITY/i.test(text) || /<(?:[A-Za-z_][\w.-]*:)?(?:f|hyperlink)\b/.test(text)) return refuse();
 const open = '<sheetData>', close = '</sheetData>', begin = text.indexOf(open), end = text.indexOf(close);
 if (begin < 0 || end < begin || text.indexOf(open, begin + open.length) !== -1 || text.indexOf(close, end + close.length) !== -1) return refuse();
 const bodyStart = begin + open.length, rows: { start: number; end: number }[] = [];
 const pattern = /<row\b[^>]*\br="([1-9]\d*)"[^>]*>[^]*?<\/row>/g;
 pattern.lastIndex = bodyStart;
 let at = bodyStart, match: RegExpExecArray | null;
 while ((match = pattern.exec(text)) && match.index < end) {
  if (match.index !== at || Number(match[1]) !== rows.length + 1 || pattern.lastIndex > end) return refuse();
  rows.push({ start: match.index, end: pattern.lastIndex }); at = pattern.lastIndex;
 }
 const nativeEnd = /:[A-Z]+([1-9]\d*)$/.exec(OFFICIAL_TEMPLATES[stream].native_dimension);
 if (!nativeEnd || rows.length !== Number(nativeEnd[1]) || at !== end || rows.length < BOUNDS.rows + 1) return refuse('TEMPLATE_CHANGED');
 const prefix = text.slice(0, bodyStart), header = text.slice(rows[0].start, rows[0].end), suffix = text.slice(end);
 return Object.freeze({
  rowCount: rows.length,
  project(firstDataRow = 2, count = 0): string {
   if (!Number.isSafeInteger(firstDataRow) || !Number.isSafeInteger(count) || firstDataRow < 2 || count < 0 || count > VERIFIED_WORKSHEET_WINDOW_ROWS
    || firstDataRow + count - 1 > rows.length || firstDataRow + count - 1 > BOUNDS.rows + 1 || firstDataRow > BOUNDS.rows + 1) return refuse('INVALID_REQUEST');
   const selected = count === 0 ? '' : text.slice(rows[firstDataRow - 1].start, rows[firstDataRow + count - 2].end);
   return prefix + header + selected + suffix;
  },
 });
}
