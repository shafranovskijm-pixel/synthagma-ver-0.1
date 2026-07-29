// Excel/CSV parser + template generator for bulk student import.
// Template columns (case-insensitive, order-independent):
//   Логин | Пароль | Табельный номер | Фамилия | Имя | Отчество | ФИО | Email | Группа | Курс, Курс, Курс …

export interface ParsedStudentRow {
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

export function parseRows(rawHeader: any[], rawRows: any[][]): ParseResult {
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
  return parseRows(rows[0] as any[], rows.slice(1) as any[][]);
}

export async function downloadStudentsTemplate() {
  const XLSX = await import("xlsx");
  const headers = [
    "Логин", "Пароль", "Табельный номер",
    "Фамилия", "Имя", "Отчество", "Email", "Группа",
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
  const rows = results.map(r => ({
    Статус: r.success ? "OK" : "Ошибка",
    ФИО: r.full_name,
    Логин: r.login || "",
    Пароль: r.password || "",
    Email: r.email || "",
    Группа: r.group_name || "",
    "Зачислено курсов": r.courses_enrolled,
    "Курсы не найдены": r.courses_missing.join("; "),
    Ошибка: r.error || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "results");
  XLSX.writeFile(wb, "students_import_results.xlsx");
}
