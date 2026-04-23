/**
 * Перепаковщик файлов ФИС ФРДО.
 *
 * Принимает «грязный» Excel клиента (с невидимыми символами, табуляциями,
 * кривыми датами и СНИЛС, без валидаций) и переукладывает строки в наш
 * эталонный шаблон через buildDPORow / buildPORow.
 *
 * Вся обработка выполняется в браузере — файл не отправляется на сервер.
 */

import {
  DPO_HEADERS,
  PO_HEADERS,
  buildDPORow,
  buildPORow,
} from "./frdoExcelExport";
import {
  FRDO_TRAINING_FORMS,
  FRDO_FINANCING_SOURCES,
  FRDO_EDUCATION_FORMS,
  FRDO_EDUCATION_LEVELS,
} from "@/constants/frdo";

// ============================================================
// Типы
// ============================================================

export type FrdoSheetType = "dpo" | "po";

export interface SanitizedCell {
  value: string | number;
  fixed: boolean;
  reason?: string;
}

export interface SanitizedRow {
  /** Очищенные значения в порядке наших HEADERS (41 для DPO / 35 для PO) */
  cells: SanitizedCell[];
  /** Имена обязательных полей, которые остались пустыми после очистки */
  missingRequired: string[];
  /** Номер строки в исходном файле (1-based, включая шапку) */
  sourceRowNumber: number;
}

export interface ParseResult {
  type: FrdoSheetType;
  /** Заголовки исходного файла (как нашли) — для диагностики */
  sourceHeaders: string[];
  /** Карта: индекс_в_наших_HEADERS → индекс_в_источнике (или -1, если нет) */
  columnMap: number[];
  /** Очищенные строки в порядке наших HEADERS */
  rows: SanitizedRow[];
  /** Количество распознанных колонок источника */
  matchedColumns: number;
}

// ============================================================
// Очистка строк
// ============================================================

/** Невидимые символы, которые ломают валидацию ФИС ФРДО */
const INVISIBLE_CHARS_RE = /[\u00A0\u200B\u200C\u200D\u200E\u200F\uFEFF\t]/g;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

export function stripInvisibles(s: string): string {
  return s.replace(INVISIBLE_CHARS_RE, " ").replace(CONTROL_CHARS_RE, "");
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeHeaderKey(s: string): string {
  return normalizeWhitespace(stripInvisibles(String(s ?? "")))
    .toLowerCase()
    .replace(/[ёе]/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/[^a-zа-я0-9 /,()-]/gi, "");
}

// ============================================================
// СНИЛС
// ============================================================

/** "123 456 789-01" / "12345678901" / "123-456-789 01" → "123-456-789 01" */
export function sanitizeSnils(raw: unknown): SanitizedCell {
  const original = String(raw ?? "");
  if (!original.trim()) return { value: "", fixed: false };
  const digits = stripInvisibles(original).replace(/\D/g, "");
  if (digits.length !== 11) {
    return {
      value: original,
      fixed: false,
      reason: `СНИЛС содержит ${digits.length} цифр вместо 11`,
    };
  }
  const formatted = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9)}`;
  return { value: formatted, fixed: formatted !== original };
}

// ============================================================
// Даты
// ============================================================

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Excel-серийная дата (1900-system) → JS Date */
function excelSerialToDate(n: number): Date | null {
  if (!Number.isFinite(n) || n < 1 || n > 80000) return null;
  // Excel epoch: 1899-12-30 (учитывает баг с 1900 как високосным)
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000);
}

/**
 * Распознаёт дату из ISO ("2024-01-31"), dd.MM.yyyy, dd/MM/yyyy,
 * Excel serial number и Date-объекта. Возвращает "dd.MM.yyyy".
 */
export function sanitizeDate(raw: unknown): SanitizedCell {
  if (raw === null || raw === undefined || raw === "") {
    return { value: "", fixed: false };
  }

  // Date-объект
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const formatted = `${pad2(raw.getUTCDate())}.${pad2(raw.getUTCMonth() + 1)}.${raw.getUTCFullYear()}`;
    return { value: formatted, fixed: true };
  }

  // Excel serial
  if (typeof raw === "number") {
    const d = excelSerialToDate(raw);
    if (d) {
      const formatted = `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
      return { value: formatted, fixed: true };
    }
    return { value: String(raw), fixed: false, reason: "Не удалось распознать дату" };
  }

  const original = String(raw);
  const cleaned = normalizeWhitespace(stripInvisibles(original));
  if (!cleaned) return { value: "", fixed: false };

  // dd.MM.yyyy / dd/MM/yyyy / dd-MM-yyyy
  const ddmm = cleaned.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (ddmm) {
    let [, dd, mm, yyyy] = ddmm;
    if (yyyy.length === 2) yyyy = (Number(yyyy) > 50 ? "19" : "20") + yyyy;
    const formatted = `${pad2(Number(dd))}.${pad2(Number(mm))}.${yyyy}`;
    return { value: formatted, fixed: formatted !== original };
  }

  // ISO yyyy-MM-dd
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    const formatted = `${pad2(Number(dd))}.${pad2(Number(mm))}.${yyyy}`;
    return { value: formatted, fixed: true };
  }

  // Числовая строка → Excel serial
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const d = excelSerialToDate(Number(cleaned));
    if (d) {
      const formatted = `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
      return { value: formatted, fixed: true };
    }
  }

  return { value: cleaned, fixed: cleaned !== original, reason: "Не удалось распознать формат даты" };
}

// ============================================================
// Пол
// ============================================================

const GENDER_MAP: Record<string, string> = {
  м: "Муж", муж: "Муж", "м.": "Муж", мужской: "Муж", male: "Муж", m: "Муж",
  ж: "Жен", жен: "Жен", "ж.": "Жен", женский: "Жен", female: "Жен", f: "Жен",
};

export function sanitizeGender(raw: unknown): SanitizedCell {
  const original = String(raw ?? "");
  const key = normalizeWhitespace(stripInvisibles(original)).toLowerCase();
  if (!key) return { value: "", fixed: false };
  const mapped = GENDER_MAP[key];
  if (mapped) return { value: mapped, fixed: mapped !== original };
  return { value: original, fixed: false, reason: "Не удалось определить пол" };
}

// ============================================================
// Fuzzy-match по словарю
// ============================================================

function fuzzyMatch(value: string, options: readonly string[]): string | null {
  const norm = normalizeWhitespace(stripInvisibles(value)).toLowerCase();
  if (!norm) return null;
  // exact (без регистра)
  const exact = options.find((o) => o.toLowerCase() === norm);
  if (exact) return exact;
  // contains в обе стороны
  const contains = options.find(
    (o) => o.toLowerCase().includes(norm) || norm.includes(o.toLowerCase()),
  );
  return contains ?? null;
}

export function sanitizeFromDict(raw: unknown, dict: readonly string[]): SanitizedCell {
  const original = String(raw ?? "");
  if (!original.trim()) return { value: "", fixed: false };
  const matched = fuzzyMatch(original, dict);
  if (matched) return { value: matched, fixed: matched !== original };
  return { value: original, fixed: false, reason: "Значение не из справочника" };
}

// ============================================================
// Гражданство
// ============================================================

export function sanitizeCitizenship(raw: unknown): SanitizedCell {
  const original = String(raw ?? "").trim();
  if (!original) return { value: "643", fixed: true, reason: "Подставлено по умолчанию (Россия)" };
  const digits = stripInvisibles(original).replace(/\D/g, "");
  if (digits) return { value: digits, fixed: digits !== original };
  // По названию страны → 643 для России
  const lc = original.toLowerCase();
  if (lc.includes("росс") || lc.includes("russ") || lc === "рф") {
    return { value: "643", fixed: true };
  }
  return { value: original, fixed: false, reason: "Не код ОКСМ" };
}

// ============================================================
// Базовый «strip + trim»
// ============================================================

export function sanitizeText(raw: unknown): SanitizedCell {
  if (raw === null || raw === undefined) return { value: "", fixed: false };
  const original = String(raw);
  const cleaned = normalizeWhitespace(stripInvisibles(original));
  return { value: cleaned, fixed: cleaned !== original };
}

/**
 * Нормализует наименование профессии/должности под классификатор ФИС ФРДО:
 * первая буква каждого значимого слова — заглавная, остальные — строчные.
 * Примеры: "охранник" → "Охранник", "ВОДИТЕЛЬ автомобиля" → "Водитель автомобиля".
 *
 * ФРДО-валидатор сравнивает значение с классификатором по точному совпадению,
 * поэтому регистр критичен.
 */
export function sanitizeProfessionName(raw: unknown): SanitizedCell {
  if (raw === null || raw === undefined) return { value: "", fixed: false };
  const original = String(raw);
  const cleaned = normalizeWhitespace(stripInvisibles(original));
  if (!cleaned) return { value: "", fixed: cleaned !== original };
  // Капитализация: первая буква слова — верхний регистр, остальные — нижний.
  // Сохраняем разделители (пробел, дефис) как есть.
  const titled = cleaned
    .toLowerCase()
    .replace(/(^|[\s\-])([а-яёa-z])/gu, (_m, sep, ch) => sep + ch.toUpperCase());
  return { value: titled, fixed: titled !== original };
}

export function sanitizeNumber(raw: unknown): SanitizedCell {
  if (raw === null || raw === undefined || raw === "") return { value: "", fixed: false };
  if (typeof raw === "number") return { value: raw, fixed: false };
  const cleaned = normalizeWhitespace(stripInvisibles(String(raw))).replace(",", ".");
  const n = Number(cleaned);
  if (Number.isFinite(n)) return { value: n, fixed: cleaned !== String(raw) };
  return { value: cleaned, fixed: true, reason: "Не удалось распознать число" };
}

// ============================================================
// Метаданные колонок (соответствие и тип очистки)
// ============================================================

type CellKind =
  | "text"
  | "number"
  | "date"
  | "snils"
  | "gender"
  | "citizenship"
  | "training_form"
  | "financing"
  | "education_form"
  | "education_level"
  | "profession"
  | "static_original"
  | "static_no"
  | "auto_reg_number";

interface ColumnMeta {
  /** Заголовок в нашем шаблоне */
  header: string;
  /** Альтернативные названия в чужих файлах (нормализованные) */
  aliases: string[];
  kind: CellKind;
  required?: boolean;
  /** Дефолт, если колонки нет в источнике */
  defaultValue?: string | number;
}

/** Хелпер: нормализованный массив алиасов */
const a = (...arr: string[]) => arr.map(normalizeHeaderKey);

// Алиасы для общих ФИО/персональных колонок
const LASTNAME_ALIASES = ["фамилия получателя", "фамилия", "фамилия слушателя", "фамилия ученика", "фамилия обучающегося"];
const FIRSTNAME_ALIASES = ["имя получателя", "имя", "имя слушателя", "имя ученика", "имя обучающегося"];
const MIDDLENAME_ALIASES = ["отчество получателя при наличии", "отчество получателя", "отчество", "отчество слушателя", "отчество ученика"];
const BIRTHDATE_ALIASES = ["дата рождения получателя", "дата рождения", "др", "дата рождения слушателя", "дата рождения ученика"];
const GENDER_ALIASES = ["пол получателя", "пол", "пол слушателя", "гендер"];
const SNILS_ALIASES = ["снилс", "снилс получателя", "номер снилс", "страховой номер", "номер страхового свидетельства", "снилс ученика", "снилс слушателя"];
const ISSUE_DATE_ALIASES = ["дата выдачи документа", "дата выдачи", "дата выдачи док", "дата выдачи свидетельства", "дата выдачи диплома", "дата выдачи удостоверения"];
const REG_NUMBER_ALIASES = ["регистрационный номер", "рег номер", "рег. номер", "регистрационный номер документа", "номер регистрационный"];

// DPO — 41 колонка
const DPO_META: ColumnMeta[] = [
  { header: DPO_HEADERS[0], aliases: a("вид документа", "тип документа"), kind: "text", required: true },
  { header: DPO_HEADERS[1], aliases: a("статус документа"), kind: "static_original", defaultValue: "Оригинал" },
  { header: DPO_HEADERS[2], aliases: a("подтверждение утраты"), kind: "static_no", defaultValue: "Нет" },
  { header: DPO_HEADERS[3], aliases: a("подтверждение обмена"), kind: "static_no", defaultValue: "Нет" },
  { header: DPO_HEADERS[4], aliases: a("подтверждение уничтожения"), kind: "static_no", defaultValue: "Нет" },
  { header: DPO_HEADERS[5], aliases: a("серия документа"), kind: "text", defaultValue: "нет" },
  { header: DPO_HEADERS[6], aliases: a("номер документа"), kind: "text", required: true },
  { header: DPO_HEADERS[7], aliases: a(...ISSUE_DATE_ALIASES), kind: "date", required: true },
  { header: DPO_HEADERS[8], aliases: a(...REG_NUMBER_ALIASES), kind: "auto_reg_number", defaultValue: "нет" },
  { header: DPO_HEADERS[9], aliases: a("дополнительная профессиональная программа", "дпо программа", "вид программы"), kind: "text" },
  { header: DPO_HEADERS[10], aliases: a("наименование дополнительной профессиональной программы", "наименование программы", "программа", "название программы", "программа обучения", "наименование курса"), kind: "text", required: true },
  { header: DPO_HEADERS[11], aliases: a("наименование области профессиональной деятельности", "область деятельности", "область профессиональной деятельности"), kind: "text" },
  { header: DPO_HEADERS[12], aliases: a("укрупненные группы специальностей", "группа специальностей", "укрупненная группа"), kind: "text" },
  { header: DPO_HEADERS[13], aliases: a("наименование квалификации профессии специальности", "квалификация", "наименование квалификации"), kind: "profession" },
  { header: DPO_HEADERS[14], aliases: a("уровень образования во спо", "уровень образования"), kind: "education_level" },
  { header: DPO_HEADERS[15], aliases: a("фамилия указанная в дипломе о во или спо", "фамилия в дипломе"), kind: "text" },
  { header: DPO_HEADERS[16], aliases: a("серия документа о во спо", "серия диплома"), kind: "text" },
  { header: DPO_HEADERS[17], aliases: a("номер документа о во спо", "номер диплома"), kind: "text" },
  { header: DPO_HEADERS[18], aliases: a("год начала обучения для документа о квалификации", "год начала обучения", "год начала"), kind: "number" },
  { header: DPO_HEADERS[19], aliases: a("год окончания обучения для документа о квалификации", "год окончания обучения", "год окончания"), kind: "number" },
  { header: DPO_HEADERS[20], aliases: a("срок обучения часов для документа о квалификации", "срок обучения часов", "часов", "объем часов"), kind: "number" },
  { header: DPO_HEADERS[21], aliases: a(...LASTNAME_ALIASES), kind: "text", required: true },
  { header: DPO_HEADERS[22], aliases: a(...FIRSTNAME_ALIASES), kind: "text", required: true },
  { header: DPO_HEADERS[23], aliases: a(...MIDDLENAME_ALIASES), kind: "text" },
  { header: DPO_HEADERS[24], aliases: a(...BIRTHDATE_ALIASES), kind: "date", required: true },
  { header: DPO_HEADERS[25], aliases: a(...GENDER_ALIASES), kind: "gender", required: true },
  { header: DPO_HEADERS[26], aliases: a(...SNILS_ALIASES), kind: "snils", required: true },
  { header: DPO_HEADERS[27], aliases: a("форма обучения"), kind: "training_form", defaultValue: "Очная" },
  { header: DPO_HEADERS[28], aliases: a("источник финансирования обучения", "источник финансирования"), kind: "financing", defaultValue: "Платное обучение" },
  { header: DPO_HEADERS[29], aliases: a("форма получения образования на момент прекращения образовательных отношений", "форма получения образования"), kind: "education_form", defaultValue: "в образовательной организации" },
  { header: DPO_HEADERS[30], aliases: a("гражданство получателя код страны по оксм", "гражданство", "оксм"), kind: "citizenship", defaultValue: "643" },
  // 31..40 — поля «оригинала», обычно пустые
  ...DPO_HEADERS.slice(31).map((h) => ({ header: h, aliases: a(h), kind: "text" as CellKind })),
];

// PO — 35 колонок
const PO_META: ColumnMeta[] = [
  { header: PO_HEADERS[0], aliases: a("вид документа", "тип документа"), kind: "text", required: true },
  { header: PO_HEADERS[1], aliases: a("статус документа"), kind: "static_original", defaultValue: "Оригинал" },
  { header: PO_HEADERS[2], aliases: a("подтверждение утраты"), kind: "static_no", defaultValue: "Нет" },
  { header: PO_HEADERS[3], aliases: a("подтверждение обмена"), kind: "static_no", defaultValue: "Нет" },
  { header: PO_HEADERS[4], aliases: a("подтверждение уничтожения"), kind: "static_no", defaultValue: "Нет" },
  { header: PO_HEADERS[5], aliases: a("серия документа"), kind: "text", defaultValue: "Нет" },
  { header: PO_HEADERS[6], aliases: a("номер документа"), kind: "text", required: true },
  { header: PO_HEADERS[7], aliases: a(...ISSUE_DATE_ALIASES), kind: "date", required: true },
  { header: PO_HEADERS[8], aliases: a(...REG_NUMBER_ALIASES), kind: "auto_reg_number", defaultValue: "нет" },
  { header: PO_HEADERS[9], aliases: a("программа профессионального обучения направление подготовки", "вид программы", "направление подготовки"), kind: "text" },
  { header: PO_HEADERS[10], aliases: a("наименование программы профессионального обучения", "наименование программы", "программа", "название программы", "программа обучения", "наименование курса"), kind: "text", required: true },
  { header: PO_HEADERS[11], aliases: a(
    "наименование профессий рабочих должностей служащих",
    "наименование профессии рабочего должности служащего",
    "наименование профессии рабочего",
    "наименование должности служащего",
    "профессия рабочего",
    "должность служащего",
    "наименование профессии",
    "профессии рабочих",
    "профессия",
    "должность",
  ), kind: "profession", required: true },
  { header: PO_HEADERS[12], aliases: a("присвоенный квалификационный разряд класс категория при наличии", "разряд", "квалификационный разряд", "класс", "категория"), kind: "text" },
  { header: PO_HEADERS[13], aliases: a("год начала обучения", "год начала"), kind: "number" },
  { header: PO_HEADERS[14], aliases: a("год окончания обучения", "год окончания"), kind: "number" },
  { header: PO_HEADERS[15], aliases: a("срок обучения часов", "часов", "объем часов"), kind: "number" },
  { header: PO_HEADERS[16], aliases: a(...LASTNAME_ALIASES), kind: "text", required: true },
  { header: PO_HEADERS[17], aliases: a(...FIRSTNAME_ALIASES), kind: "text", required: true },
  { header: PO_HEADERS[18], aliases: a(...MIDDLENAME_ALIASES), kind: "text" },
  { header: PO_HEADERS[19], aliases: a(...BIRTHDATE_ALIASES), kind: "date", required: true },
  { header: PO_HEADERS[20], aliases: a(...GENDER_ALIASES), kind: "gender", required: true },
  { header: PO_HEADERS[21], aliases: a(...SNILS_ALIASES), kind: "snils", required: true },
  { header: PO_HEADERS[22], aliases: a("гражданство получателя код страны по оксм", "гражданство", "оксм"), kind: "citizenship", defaultValue: "643" },
  { header: PO_HEADERS[23], aliases: a("форма обучения"), kind: "training_form", defaultValue: "Очная" },
  { header: PO_HEADERS[24], aliases: a("источник финансирования обучения", "источник финансирования"), kind: "financing", defaultValue: "Платное обучение" },
  { header: PO_HEADERS[25], aliases: a("форма получения образования на момент прекращения образовательных отношений", "форма получения образования"), kind: "education_form", defaultValue: "в образовательной организации" },
  // 26..34 — поля «оригинала»
  ...PO_HEADERS.slice(26).map((h) => ({ header: h, aliases: a(h), kind: "text" as CellKind })),
];

function getMeta(type: FrdoSheetType): ColumnMeta[] {
  return type === "dpo" ? DPO_META : PO_META;
}

// ============================================================
// Применение очистки к одной ячейке
// ============================================================

function sanitizeByKind(raw: unknown, kind: CellKind, fallback?: string | number): SanitizedCell {
  switch (kind) {
    case "snils": return sanitizeSnils(raw);
    case "date": return sanitizeDate(raw);
    case "gender": return sanitizeGender(raw);
    case "citizenship": return sanitizeCitizenship(raw);
    case "training_form": return sanitizeFromDict(raw, FRDO_TRAINING_FORMS);
    case "financing": return sanitizeFromDict(raw, FRDO_FINANCING_SOURCES);
    case "education_form": return sanitizeFromDict(raw, FRDO_EDUCATION_FORMS);
    case "education_level": return sanitizeFromDict(raw, FRDO_EDUCATION_LEVELS);
    case "number": return sanitizeNumber(raw);
    case "auto_reg_number": {
      const t = sanitizeText(raw);
      if (!t.value) return { value: fallback ?? "нет", fixed: true, reason: "Регистрационный номер не указан — подставлено 'нет'" };
      return t;
    }
    case "static_original":
    case "static_no": {
      const cleaned = sanitizeText(raw);
      if (!cleaned.value) return { value: fallback ?? "", fixed: true, reason: "Подставлено по умолчанию" };
      return cleaned;
    }
    case "text":
    default: return sanitizeText(raw);
  }
}

// ============================================================
// Парсинг + auto-detect типа листа
// ============================================================

/** Авто-детект DPO/ПО по заголовкам строки */
function detectType(headers: string[]): FrdoSheetType {
  const flat = headers.map(normalizeHeaderKey).join(" | ");
  if (
    flat.includes("программа профессионального обучения") ||
    flat.includes("наименование профессий рабочих") ||
    flat.includes("свидетельство о профессии рабочего")
  ) {
    return "po";
  }
  return "dpo";
}

/** Поиск header-строки в первых N строках по совпадению ≥ minMatches заголовков */
function findHeaderRow(
  rows: unknown[][],
  expectedNorm: Set<string>,
  minMatches = 5,
  maxScan = 8,
): number {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const row = rows[i] ?? [];
    let matches = 0;
    for (const cell of row) {
      const k = normalizeHeaderKey(String(cell ?? ""));
      if (k && expectedNorm.has(k)) matches++;
    }
    if (matches >= minMatches) return i;
  }
  return 0;
}

/** Стем (первые 5 символов) — для сравнения форм слова: профессии/профессий/профессия */
function stemToken(t: string): string {
  return t.length > 5 ? t.slice(0, 5) : t;
}

/** Доля общих стемов (слов длиной ≥ 4) между двумя нормализованными заголовками */
function tokenOverlap(headerNorm: string, aliasNorm: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .split(/[^a-zа-я0-9]+/i)
        .filter((t) => t.length >= 4)
        .map(stemToken),
    );
  const a1 = tokens(headerNorm);
  const a2 = tokens(aliasNorm);
  if (a1.size === 0 || a2.size === 0) return 0;
  let common = 0;
  for (const t of a1) if (a2.has(t)) common++;
  return common / Math.max(a1.size, a2.size);
}

/** Построить columnMap: индекс_в_наших_HEADERS → индекс_в_источнике (или -1) */
function buildColumnMap(sourceHeaders: string[], meta: ColumnMeta[]): number[] {
  const sourceNorm = sourceHeaders.map(normalizeHeaderKey);
  const used = new Set<number>();

  const map = meta.map((m) => {
    // exact
    for (const alias of m.aliases) {
      const idx = sourceNorm.indexOf(alias);
      if (idx >= 0 && !used.has(idx)) {
        used.add(idx);
        return idx;
      }
    }
    // partial contains
    for (const alias of m.aliases) {
      const idx = sourceNorm.findIndex(
        (h, i) => !used.has(i) && h && (h.includes(alias) || alias.includes(h)),
      );
      if (idx >= 0) {
        used.add(idx);
        return idx;
      }
    }
    // fuzzy token overlap ≥ 60 %
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < sourceNorm.length; i++) {
      if (used.has(i) || !sourceNorm[i]) continue;
      for (const alias of m.aliases) {
        const score = tokenOverlap(sourceNorm[i], alias);
        if (score >= 0.6 && score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      return bestIdx;
    }
    return -1;
  });

  // Позиционный fallback: если число колонок источника совпадает с эталоном
  // и ≥ 80 % обязательных колонок уже сматчено по тексту — добиваем оставшиеся
  // -1 по индексу. Защищает от полностью переименованных заголовков.
  const expectedCols = meta.length;
  if (sourceHeaders.length === expectedCols) {
    const requiredMeta = meta.filter((m) => m.required);
    const requiredMatched = meta.filter((m, i) => m.required && map[i] >= 0).length;
    const requiredRatio = requiredMeta.length === 0 ? 1 : requiredMatched / requiredMeta.length;
    if (requiredRatio >= 0.8) {
      for (let i = 0; i < map.length; i++) {
        if (map[i] === -1 && !used.has(i) && i < sourceHeaders.length) {
          map[i] = i;
          used.add(i);
        }
      }
    }
  }

  return map;
}

/**
 * Главная функция: читает .xlsx файл, определяет тип DPO/ПО,
 * чистит каждую ячейку и возвращает структурированный результат.
 *
 * @param file пользовательский xlsx
 * @param forcedType если задан, пропускает авто-детект
 */
export async function parseFrdoXlsx(
  file: File,
  forcedType?: FrdoSheetType,
): Promise<ParseResult> {
  const { default: ExcelJS } = await import("exceljs");
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Файл не содержит листов");

  // Соберём все строки в простой массив
  const rawRows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const arr: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // Excel хранит дату как Date — оставим как есть, sanitizeDate разберётся
      const v = cell.value;
      if (v && typeof v === "object" && "result" in (v as any)) {
        arr[colNumber - 1] = (v as any).result;
      } else if (v && typeof v === "object" && "richText" in (v as any)) {
        arr[colNumber - 1] = (v as any).richText.map((r: any) => r.text).join("");
      } else if (v && typeof v === "object" && "text" in (v as any)) {
        arr[colNumber - 1] = (v as any).text;
      } else {
        arr[colNumber - 1] = v as any;
      }
    });
    rawRows.push(arr);
  });

  if (rawRows.length === 0) throw new Error("Файл пуст");

  // Сначала пытаемся найти header по объединённому списку обоих типов
  const allExpected = new Set<string>([
    ...DPO_META.flatMap((m) => m.aliases),
    ...PO_META.flatMap((m) => m.aliases),
  ]);
  const headerIdx = findHeaderRow(rawRows, allExpected);
  const sourceHeaders = (rawRows[headerIdx] ?? []).map((c) => String(c ?? ""));

  const type: FrdoSheetType = forcedType ?? detectType(sourceHeaders);
  const meta = getMeta(type);
  const columnMap = buildColumnMap(sourceHeaders, meta);
  const matchedColumns = columnMap.filter((i) => i >= 0).length;

  // Обработка строк после header
  const dataRows = rawRows.slice(headerIdx + 1);
  const rows: SanitizedRow[] = [];
  for (let r = 0; r < dataRows.length; r++) {
    const src = dataRows[r] ?? [];
    // Skip полностью пустых строк
    const hasAny = src.some((v) => v !== null && v !== undefined && String(v).trim() !== "");
    if (!hasAny) continue;

    const cells: SanitizedCell[] = meta.map((m, i) => {
      const srcIdx = columnMap[i];
      const raw = srcIdx >= 0 ? src[srcIdx] : undefined;
      return sanitizeByKind(raw, m.kind, m.defaultValue);
    });

    const missingRequired = meta
      .map((m, i) => (m.required && !String(cells[i].value).trim() ? m.header : null))
      .filter((x): x is string => x !== null);

    rows.push({
      cells,
      missingRequired,
      sourceRowNumber: headerIdx + 2 + r,
    });
  }

  return { type, sourceHeaders, columnMap, rows, matchedColumns };
}

// ============================================================
// Сборка чистых строк через buildDPORow / buildPORow
// ============================================================

/** Возвращает массив строк в порядке headers, готовых для exportFRDOExcel */
export function buildCleanRows(parse: ParseResult): (string | number)[][] {
  const { type, rows } = parse;
  const result: (string | number)[][] = [];

  for (const row of rows) {
    const v = (i: number) => row.cells[i]?.value ?? "";
    const s = (i: number) => String(v(i));
    const n = (i: number) => {
      const x = v(i);
      if (typeof x === "number") return x;
      const num = Number(String(x).replace(",", "."));
      return Number.isFinite(num) ? num : (String(x) as unknown as number);
    };

    if (type === "dpo") {
      result.push(
        buildDPORow({
          documentType: s(0),
          docNumber: s(6),
          regNumber: s(8),
          issueDate: s(7),
          programType: s(9),
          programName: s(10),
          professionalArea: s(11),
          specialtyGroup: s(12),
          qualificationName: s(13),
          educationLevel: s(14),
          educationDocLastName: s(15),
          educationDocSeries: s(16),
          educationDocNumber: s(17),
          startYear: n(18) as any,
          endYear: n(19) as any,
          durationHours: typeof n(20) === "number" ? (n(20) as number) : 0,
          lastName: s(21),
          firstName: s(22),
          middleName: s(23),
          birthDate: s(24),
          gender: s(25),
          snils: s(26),
          trainingForm: s(27),
          financingSource: s(28),
          educationForm: s(29),
          citizenshipCode: s(30),
        }),
      );
    } else {
      result.push(
        buildPORow({
          documentType: s(0),
          docNumber: s(6),
          regNumber: s(8),
          issueDate: s(7),
          programType: s(9),
          programName: s(10),
          professionName: s(11),
          qualificationRank: s(12),
          startYear: n(13) as any,
          endYear: n(14) as any,
          durationHours: typeof n(15) === "number" ? (n(15) as number) : 0,
          lastName: s(16),
          firstName: s(17),
          middleName: s(18),
          birthDate: s(19),
          gender: s(20),
          snils: s(21),
          citizenshipCode: s(22),
          trainingForm: s(23),
          financingSource: s(24),
          educationForm: s(25),
        }),
      );
    }
  }
  return result;
}

/** Сводная статистика для отчёта */
export interface SanitizeStats {
  totalRows: number;
  fixedCells: number;
  fixedRows: number;
  missingRequiredRows: number;
}

export function calcStats(parse: ParseResult): SanitizeStats {
  let fixedCells = 0;
  let fixedRows = 0;
  let missingRequiredRows = 0;
  for (const r of parse.rows) {
    const fc = r.cells.filter((c) => c.fixed).length;
    if (fc > 0) {
      fixedRows++;
      fixedCells += fc;
    }
    if (r.missingRequired.length > 0) missingRequiredRows++;
  }
  return {
    totalRows: parse.rows.length,
    fixedCells,
    fixedRows,
    missingRequiredRows,
  };
}

/** Получить заголовки нашего шаблона для превью */
export function getHeadersForType(type: FrdoSheetType): string[] {
  return type === "dpo" ? [...DPO_HEADERS] : [...PO_HEADERS];
}

/** Список наших заголовков, для которых не нашлось соответствия в исходнике */
export function getUnmappedHeaders(parse: ParseResult): { index: number; header: string; required: boolean }[] {
  const meta = getMeta(parse.type);
  const result: { index: number; header: string; required: boolean }[] = [];
  parse.columnMap.forEach((srcIdx, i) => {
    if (srcIdx === -1) {
      result.push({ index: i, header: meta[i].header, required: !!meta[i].required });
    }
  });
  return result;
}
