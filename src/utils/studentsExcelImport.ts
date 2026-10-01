// Excel/CSV parser + template generator for bulk student import.
// Template columns (case-insensitive, order-independent):
//   Логин | Пароль | Табельный номер | Фамилия | Имя | Отчество | ФИО | Email | Группа | Курс, Курс, Курс …
import { normalizeStudentRegistrationDetails, type StudentRegistrationDetails } from "../../supabase/functions/_shared/student-registration-details";

export interface ParsedStudentRow extends StudentRegistrationDetails {
  rowIndex: number; // 1-based (excludes header)
  login?: string;
  password?: string;
  employee_number?: string;
  last_name?: string;
  first_name?: string;
  middle_name?: string;
  full_name: string; // computed
  email?: string;
  group_name?: string;
  course_titles: string[];
  warnings: string[];
  detailsError?: string;
}

export interface ParseResult {
  rows: ParsedStudentRow[];
  headers: string[];
  detectedColumns: {
    login: boolean;
    password: boolean;
    employee_number: boolean;
    fio: boolean;
    last: boolean;
    first: boolean;
    middle: boolean;
    email: boolean;
    group: boolean;
    department: boolean;
    job_position: boolean;
    snils: boolean;
    birth_date: boolean;
    confirm_identity: boolean;
    courses: number;
  };
  uniqueGroups: string[];
  uniqueCourses: string[];
}

const norm = (s: any) => String(s ?? "").trim();
const nkey = (s: any) => norm(s).toLowerCase().replace(/ё/g, "е");

function matchIdx(headers: string[], predicate: (h: string) => boolean): number {
  return headers.findIndex(h => predicate(nkey(h)));
}

function matchAllIdx(headers: string[], predicate: (h: string) => boolean): number[] {
  const out: number[] = [];
  headers.forEach((h, i) => { if (predicate(nkey(h))) out.push(i); });
  return out;
}

export function parseRows(rawHeader: any[], rawRows: any[][], date1904 = false): ParseResult {
  const headers = rawHeader.map(h => norm(h));

  const iLogin = matchIdx(headers, h => h === "логин" || h === "login");
  const iPass = matchIdx(headers, h => h === "пароль" || h === "password");
  const iEmp = matchIdx(headers, h => h.includes("табель") || h.includes("personnel") || h.includes("employee"));
  const iLast = matchIdx(headers, h => h === "фамилия" || h === "last name" || h === "last_name" || h === "lastname");
  const iFirst = matchIdx(headers, h => h === "имя" || h === "first name" || h === "first_name" || h === "firstname");
  const iMid = matchIdx(headers, h => h === "отчество" || h === "middle name" || h === "middle_name" || h === "middlename");
  const iFio = matchIdx(headers, h => h === "фио" || h === "full name" || h === "full_name" || h === "fullname");
  const iEmail = matchIdx(headers, h => h === "email" || h === "e-mail" || h === "почта");
  const iGroup = matchIdx(headers, h => h === "группа" || h === "group");
  const iDepartment = matchIdx(headers, h => h === "подразделение" || h === "department");
  const iJobPosition = matchIdx(headers, h => h === "должность" || h === "job_position" || h === "job position");
  const iSnils = matchIdx(headers, h => h === "снилс" || h === "snils");
  const iBirthDate = matchIdx(headers, h => h === "дата рождения" || h === "birth_date");
  const iIdentity = matchIdx(headers, h => h === "идентификация подтверждена" || h === "confirm_identity");
  const iCourses = matchAllIdx(headers, h => h === "курс" || h.startsWith("курс ") || h === "course" || h.startsWith("course "));

  const rows: ParsedStudentRow[] = [];
  const groupsSet = new Set<string>();
  const coursesSet = new Set<string>();

  rawRows.forEach((row, idx) => {
    const get = (i: number) => (i >= 0 ? norm(row[i]) : "");
    const last = get(iLast);
    const first = get(iFirst);
    const mid = get(iMid);
    const fio = get(iFio);
    const composed = fio || [last, first, mid].filter(Boolean).join(" ").trim();

    // Skip empty rows
    if (!composed && !get(iLogin) && !get(iEmail)) return;

    const courseTitles = iCourses
      .map(i => norm(row[i]))
      .filter(Boolean);

    const warnings: string[] = [];
    if (!composed) warnings.push("Пустое ФИО");
    let details: StudentRegistrationDetails = {};
    let detailsError: string | undefined;
    try {
      const identityText = nkey(get(iIdentity));
      if (identityText && !["да", "нет", "true", "false", "1", "0"].includes(identityText)) {
        throw new Error("Идентификация подтверждена: укажите Да или Нет");
      }
      let birthDate: unknown = iBirthDate >= 0 ? row[iBirthDate] : undefined;
      if (birthDate instanceof Date) {
        birthDate = Number.isFinite(birthDate.getTime()) ? birthDate.toISOString().slice(0, 10) : "некорректная дата";
      } else if (typeof birthDate === "number") {
        if (!Number.isFinite(birthDate) || birthDate < 0 || (!date1904 && Math.floor(birthDate) === 60)) {
          throw new Error("Дата рождения: некорректная дата Excel");
        }
        const days = Math.floor(birthDate);
        const offset = date1904 ? days : days - (days >= 60 ? 1 : 0);
        const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
        birthDate = new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
      }
      details = normalizeStudentRegistrationDetails({
        department: get(iDepartment), job_position: get(iJobPosition), snils: get(iSnils), birth_date: birthDate,
        confirm_identity: ["да", "true", "1"].includes(identityText),
      });
    } catch (error) {
      detailsError = error instanceof Error ? error.message : "Некорректные сведения ученика";
      warnings.push(detailsError);
    }

    const group = get(iGroup);
    if (group) groupsSet.add(group);
    courseTitles.forEach(c => coursesSet.add(c));

    rows.push({
      rowIndex: idx + 1,
      login: get(iLogin) || undefined,
      password: get(iPass) || undefined,
      employee_number: get(iEmp) || undefined,
      last_name: last || undefined,
      first_name: first || undefined,
      middle_name: mid || undefined,
      full_name: composed,
      email: get(iEmail) || undefined,
      group_name: group || undefined,
      course_titles: courseTitles,
      warnings,
      ...details,
      ...(detailsError ? { detailsError } : {}),
    });
  });

  return {
    rows,
    headers,
    detectedColumns: {
      login: iLogin >= 0,
      password: iPass >= 0,
      employee_number: iEmp >= 0,
      fio: iFio >= 0,
      last: iLast >= 0,
      first: iFirst >= 0,
      middle: iMid >= 0,
      email: iEmail >= 0,
      group: iGroup >= 0,
      department: iDepartment >= 0,
      job_position: iJobPosition >= 0,
      snils: iSnils >= 0,
      birth_date: iBirthDate >= 0,
      confirm_identity: iIdentity >= 0,
      courses: iCourses.length,
    },
    uniqueGroups: Array.from(groupsSet),
    uniqueCourses: Array.from(coursesSet),
  };
}

export async function parseExcelOrCsv(file: File): Promise<ParseResult> {
  const isCsv = /\.(csv|txt)$/i.test(file.name);
  if (isCsv) {
    const text = await file.text();
    const lines = text.replace(/^\ufeff/, "").split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length === 0) return parseRows([], []);
    const sep = lines[0].includes(";") ? ";" : ",";
    const split = (l: string) => l.split(sep).map(v => v.trim().replace(/^["']|["']$/g, ""));
    const header = split(lines[0]);
    const rest = lines.slice(1).map(split);
    return parseRows(header, rest);
  }
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (rows.length === 0) return parseRows([], []);
  // A numeric cell may have an explicit 00000000000 format. Keep that displayed value.
  const snilsColumn = matchIdx(rows[0], h => h === "снилс" || h === "snils");
  const origin = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s : { r: 0, c: 0 };
  if (snilsColumn >= 0) rows.slice(1).forEach((row, index) => {
    const cell = ws[XLSX.utils.encode_cell({ r: origin.r + index + 1, c: origin.c + snilsColumn })];
    if (cell?.w && /^[\d\s-]+$/.test(cell.w) && cell.w.replace(/[\s-]/g, "").length === 11) row[snilsColumn] = cell.w;
  });
  return parseRows(rows[0] as any[], rows.slice(1) as any[][], wb.Workbook?.WBProps?.date1904 === true);
}

export async function downloadStudentsTemplate() {
  const XLSX = await import("xlsx");
  const headers = [
    "Логин", "Пароль", "Табельный номер",
    "Фамилия", "Имя", "Отчество", "Email", "Группа",
    "Подразделение", "Должность", "СНИЛС", "Дата рождения", "Идентификация подтверждена",
    "Курс 1", "Курс 2", "Курс 3", "Курс 4", "Курс 5",
  ];
  const example = [
    "Sgt104910",
    "Sgt104910",
    "104910",
    "Кожухов",
    "Владимир",
    "Евгеньевич",
    "vladimir@example.com",
    "СГТ",
    "Участок № 2", "Водитель", "001-001-998 32", "15.06.1990", "Нет",
    "Эксплуатация самосвала БелАЗ 75131",
    "Действия в аварийных ситуациях и оказание первой помощи",
    "",
    "",
    "",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  (ws as any)["!cols"] = headers.map(h => ({ wch: Math.max(14, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "students_template");
  XLSX.writeFile(wb, "students_template.xlsx");
}

export type ImportResultStatus =
  | "created"
  | "existing"
  | "partial"
  | "student_limit_exceeded"
  | "archived"
  | "profile_in_other_org"
  | "other_error";

export interface ImportResultRow {
  success: boolean;
  status: ImportResultStatus;
  full_name: string;
  login?: string;
  password?: string;
  email?: string;
  group_name?: string;
  courses_enrolled: number;
  courses_missing: string[];
  error?: string;
}

export async function downloadImportResults(results: ImportResultRow[]) {
  const XLSX = await import("xlsx");
  const statusLabel: Record<ImportResultStatus, string> = {
    created: "Создан",
    existing: "Уже существовал",
    partial: "Операция завершена частично; требуется проверка",
    student_limit_exceeded: "Превышен месячный лимит",
    archived: "В архиве",
    profile_in_other_org: "В другой организации",
    other_error: "Ошибка",
  };
  const rows = results.map(r => ({
    Статус: statusLabel[r.status] ?? (r.success ? "OK" : "Ошибка"),
    ФИО: r.full_name,
    Логин: r.login || "",
    Пароль: r.password || "",
    Email: r.email || "",
    Группа: r.group_name || "",
    "Зачислено курсов": r.status === "partial" ? "Не проверено" : r.courses_enrolled,
    "Курсы не найдены": r.courses_missing.join("; "),
    Ошибка: r.error || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "results");
  XLSX.writeFile(wb, "students_import_results.xlsx");
}
