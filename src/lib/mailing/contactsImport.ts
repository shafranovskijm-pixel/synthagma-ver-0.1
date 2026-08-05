/**
 * Импорт базы контактов рассылок: CSV / XLS / XLSX.
 * Чистые функции (парсинг, сопоставление, дедупликация) — без обращений к сети,
 * чтобы их можно было тестировать и переиспользовать в предпросмотре.
 */
import { getXLSX } from "@/utils/xlsxHelper";

export const CONTACT_FIELDS = [
  { key: "email", label: "Email", required: true },
  { key: "first_name", label: "Имя", required: false },
  { key: "last_name", label: "Фамилия", required: false },
  { key: "organization", label: "Организация", required: false },
  { key: "position", label: "Должность", required: false },
  { key: "city", label: "Город", required: false },
] as const;

export type ContactFieldKey = (typeof CONTACT_FIELDS)[number]["key"];
/** 'skip' — столбец не импортируется, 'custom' — уходит в custom_fields под именем столбца. */
export type MappingTarget = ContactFieldKey | "custom" | "skip";

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

export interface MappedContactRow {
  email: string;
  first_name?: string;
  last_name?: string;
  organization?: string;
  position?: string;
  city?: string;
  custom_fields: Record<string, string>;
}

export interface ImportSummary {
  added: number;
  duplicates: number;
  invalid: number;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(value: string | null | undefined): boolean {
  return !!value && EMAIL_RE.test(value.trim());
}

const HEADER_HINTS: Array<{ target: MappingTarget; patterns: RegExp }> = [
  { target: "email", patterns: /e-?mail|почта|адрес почты/i },
  { target: "first_name", patterns: /first.?name|имя(?!.*организ)/i },
  { target: "last_name", patterns: /last.?name|surname|фамилия/i },
  { target: "organization", patterns: /organi[sz]ation|company|компан|организац|учрежд/i },
  { target: "position", patterns: /position|должност|title|роль/i },
  { target: "city", patterns: /city|город|населённ/i },
];

/** Автоподбор соответствия «столбец файла → поле контакта». */
export function guessMapping(headers: string[]): MappingTarget[] {
  const used = new Set<MappingTarget>();
  return headers.map((h) => {
    const header = (h || "").trim();
    if (!header) return "skip";
    for (const hint of HEADER_HINTS) {
      if (hint.patterns.test(header) && !used.has(hint.target)) {
        used.add(hint.target);
        return hint.target;
      }
    }
    return "custom";
  });
}

/** Сопоставление строк файла с полями контакта. Невалидные email отбрасываются. */
export function mapRows(
  headers: string[],
  rows: string[][],
  mapping: MappingTarget[],
): { rows: MappedContactRow[]; invalid: number } {
  const out: MappedContactRow[] = [];
  let invalid = 0;

  for (const row of rows) {
    const mapped: MappedContactRow = { email: "", custom_fields: {} };
    mapping.forEach((target, i) => {
      const raw = (row[i] ?? "").toString().trim();
      if (!raw || target === "skip") return;
      if (target === "custom") {
        const name = (headers[i] || `col_${i + 1}`).trim();
        mapped.custom_fields[name] = raw;
        return;
      }
      if (target === "email") mapped.email = raw.toLowerCase();
      else mapped[target] = raw;
    });

    if (!isValidEmail(mapped.email)) {
      // полностью пустые строки игнорируем молча
      const hasAny = row.some((c) => (c ?? "").toString().trim() !== "");
      if (hasAny) invalid += 1;
      continue;
    }
    out.push(mapped);
  }

  return { rows: out, invalid };
}

/** Дедупликация ДО создания получателей: побеждает первая встреченная строка. */
export function dedupeRows(rows: MappedContactRow[]): {
  unique: MappedContactRow[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const unique: MappedContactRow[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const key = row.email.trim().toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push({ ...row, email: key });
  }
  return { unique, duplicates };
}

/** Ключи custom_fields, встречающиеся в базе — для валидации переменных письма. */
export function collectCustomKeys(rows: Array<{ custom_fields?: Record<string, unknown> | null }>): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    Object.keys(r.custom_fields ?? {}).forEach((k) => keys.add(k));
  }
  return [...keys];
}

/** Разбор файла CSV/XLS/XLSX в headers + rows. */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const XLSX = await getXLSX();
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  const nonEmpty = (matrix as unknown as string[][]).filter((r) =>
    r.some((c) => (c ?? "").toString().trim() !== ""),
  );
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headerRow, ...rest] = nonEmpty;
  return {
    headers: headerRow.map((h) => (h ?? "").toString().trim()),
    rows: rest,
  };
}
