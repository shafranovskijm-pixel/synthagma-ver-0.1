/**
 * Этап 2 «Рассылки»: парсер CSV/XLSX и построение плана импорта контактов.
 *
 * Ничего не пишет в базу — только разбирает файл, сопоставляет колонки и
 * считает итоги. Запись выполняет UI после явного подтверждения.
 */

export const CONTACT_FIELDS = [
  { key: "email", label: "Email", required: true },
  { key: "first_name", label: "Имя", required: false },
  { key: "last_name", label: "Фамилия", required: false },
  { key: "organization", label: "Организация", required: false },
  { key: "position", label: "Должность", required: false },
  { key: "city", label: "Город", required: false },
] as const;

export type ContactFieldKey = (typeof CONTACT_FIELDS)[number]["key"];

/** column index -> целевое поле, "custom" (в custom_data) или "skip". */
export type ColumnMapping = Record<number, ContactFieldKey | "custom" | "skip">;

export interface ParsedFile {
  headers: string[];
  rows: string[][];
}

export interface PlannedContact {
  rowIndex: number; // 1-based, без заголовка
  email: string;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  position: string | null;
  city: string | null;
  custom_data: Record<string, string>;
}

export interface RejectedRow {
  rowIndex: number;
  email: string;
  reason: "invalid_email" | "duplicate_in_file" | "duplicate_in_campaign" | "empty";
}

export interface ImportPlan {
  toInsert: PlannedContact[];
  rejected: RejectedRow[];
  counts: {
    total: number;
    added: number;
    duplicatesInFile: number;
    duplicatesInCampaign: number;
    invalid: number;
    skipped: number;
  };
  customKeys: string[];
}

// Allow institutional subdomains such as user@mail.region.ru.
const EMAIL_RE = /^[^\s@,;]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

export const normalizeEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const isValidEmail = (v: unknown) => EMAIL_RE.test(normalizeEmail(v));

const nkey = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/ё/g, "е");

/** CSV-парсер с поддержкой кавычек и разделителей `,` / `;` / tab. */
export function parseCsv(text: string): ParsedFile {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.split("\n")[0] || "";
  const counts = { ",": 0, ";": 0, "\t": 0 } as Record<string, number>;
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  const delim = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ",") as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQ = true; continue; }
    if (ch === delim) { row.push(cell); cell = ""; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  row.push(cell);
  rows.push(row);

  const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  const headers = (nonEmpty.shift() || []).map((h) => String(h).trim());
  return { headers, rows: nonEmpty.map((r) => headers.map((_, i) => String(r[i] ?? "").trim())) };
}

/** Читает файл (CSV или XLSX) в единый формат. */
export async function parseContactsFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") {
    return parseCsv(await file.text());
  }
  const XLSX = await import("xlsx");
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const nonEmpty = aoa.filter((r) => (r || []).some((c) => String(c ?? "").trim() !== ""));
  const headers = (nonEmpty.shift() || []).map((h) => String(h ?? "").trim());
  return { headers, rows: nonEmpty.map((r) => headers.map((_, i) => String(r[i] ?? "").trim())) };
}

const DETECT: Record<ContactFieldKey, string[]> = {
  email: ["email", "e-mail", "почта", "мейл", "мэйл", "email address"],
  first_name: ["имя", "first name", "first_name", "firstname", "name"],
  last_name: ["фамилия", "last name", "last_name", "lastname", "surname"],
  organization: ["организация", "компания", "company", "organization", "org"],
  position: ["должность", "position", "job title", "title"],
  city: ["город", "city", "town"],
};

/** Предзаполнение сопоставления по названиям колонок. */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<ContactFieldKey>();
  headers.forEach((h, i) => {
    const key = nkey(h);
    const hit = (Object.keys(DETECT) as ContactFieldKey[]).find(
      (f) => !taken.has(f) && DETECT[f].some((alias) => key === alias || key.includes(alias)),
    );
    if (hit) {
      taken.add(hit);
      mapping[i] = hit;
    } else {
      mapping[i] = key ? "custom" : "skip";
    }
  });
  return mapping;
}

export function mappingHasEmail(mapping: ColumnMapping): boolean {
  return Object.values(mapping).includes("email");
}

/**
 * Строит план импорта. Дедупликация email — case-insensitive:
 * внутри файла и относительно уже существующих получателей кампании.
 */
export function buildImportPlan(
  parsed: ParsedFile,
  mapping: ColumnMapping,
  existingEmails: string[] = [],
): ImportPlan {
  const existing = new Set(existingEmails.map(normalizeEmail).filter(Boolean));
  const seen = new Set<string>();
  const toInsert: PlannedContact[] = [];
  const rejected: RejectedRow[] = [];
  const customKeys: string[] = [];
  let skipped = 0;

  const emailIdx = Object.entries(mapping).find(([, v]) => v === "email")?.[0];
  const customIdx = Object.entries(mapping)
    .filter(([, v]) => v === "custom")
    .map(([i]) => Number(i));
  for (const i of customIdx) {
    const key = customFieldKey(parsed.headers[i] || `column_${i + 1}`);
    if (key && !customKeys.includes(key)) customKeys.push(key);
  }

  parsed.rows.forEach((row, idx) => {
    const rowIndex = idx + 1;
    const email = emailIdx === undefined ? "" : normalizeEmail(row[Number(emailIdx)]);

    if (!row.some((c) => String(c).trim() !== "")) {
      skipped++;
      return;
    }
    if (!email) {
      rejected.push({ rowIndex, email: "", reason: "empty" });
      return;
    }
    if (!isValidEmail(email)) {
      rejected.push({ rowIndex, email, reason: "invalid_email" });
      return;
    }
    if (seen.has(email)) {
      rejected.push({ rowIndex, email, reason: "duplicate_in_file" });
      return;
    }
    if (existing.has(email)) {
      seen.add(email);
      rejected.push({ rowIndex, email, reason: "duplicate_in_campaign" });
      return;
    }
    seen.add(email);

    const get = (field: ContactFieldKey): string | null => {
      const entry = Object.entries(mapping).find(([, v]) => v === field);
      if (!entry) return null;
      const value = String(row[Number(entry[0])] ?? "").trim();
      return value || null;
    };

    const custom_data: Record<string, string> = {};
    for (const i of customIdx) {
      const key = customFieldKey(parsed.headers[i] || `column_${i + 1}`);
      const value = String(row[i] ?? "").trim();
      if (key && value) custom_data[key] = value;
    }

    toInsert.push({
      rowIndex,
      email,
      first_name: get("first_name"),
      last_name: get("last_name"),
      organization: get("organization"),
      position: get("position"),
      city: get("city"),
      custom_data,
    });
  });

  return {
    toInsert,
    rejected,
    customKeys,
    counts: {
      total: parsed.rows.length,
      added: toInsert.length,
      duplicatesInFile: rejected.filter((r) => r.reason === "duplicate_in_file").length,
      duplicatesInCampaign: rejected.filter((r) => r.reason === "duplicate_in_campaign").length,
      invalid: rejected.filter((r) => r.reason === "invalid_email" || r.reason === "empty").length,
      skipped,
    },
  };
}

/** Ключ custom-переменной: латиница/цифры/подчёркивания, из названия колонки. */
export function customFieldKey(header: string): string {
  return String(header ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_а-я]/gi, "")
    .slice(0, 40);
}
