import type { ParsedStudentRow } from "./studentsExcelImport";

export interface ImportRowCheck {
  rowIndex: number;
  blocked: string[];
  warnings: string[];
}
export interface ExistingImportIdentity {
  row_index: number;
  login_taken: boolean;
  name_matches: number;
  email_matches: number;
}
const identityKey = (value?: string) => (value || "").trim().toLowerCase();
const nameKey = (value: string) => identityKey(value).replace(/ё/g, "е").replace(/\s+/g, " ");

export function analyzeStudentImport(
  rows: ParsedStudentRow[], existing: ExistingImportIdentity[] = [],
): ImportRowCheck[] {
  const counts = (key: (row: ParsedStudentRow) => string) => {
    const result = new Map<string, number>();
    for (const row of rows) { const value = key(row); if (value) result.set(value, (result.get(value) || 0) + 1); }
    return result;
  };
  const logins = counts(row => identityKey(row.login));
  const emails = counts(row => identityKey(row.email));
  const names = counts(row => nameKey(row.full_name));
  // Passwords stay in memory and never go to the preflight API or warning text.
  const passwords = counts(row => row.password || "");
  const database = new Map(existing.map(row => [row.row_index, row]));
  return rows.map(row => {
    const blocked: string[] = [];
    const warnings: string[] = [...row.warnings];
    if (!row.full_name.trim()) blocked.push("Пустое ФИО");
    if (row.detailsError) blocked.push(row.detailsError);
    if (row.login && (logins.get(identityKey(row.login)) || 0) > 1) blocked.push("Логин повторяется в файле");
    if (row.email && (emails.get(identityKey(row.email)) || 0) > 1) blocked.push("Email повторяется в файле");
    const found = database.get(row.rowIndex);
    if (found?.login_taken) blocked.push("Логин уже занят — выберите другого ученика в списке или измените логин");
    if ((names.get(nameKey(row.full_name)) || 0) > 1) warnings.push("ФИО повторяется в файле: проверьте, что это разные люди");
    if ((found?.name_matches || 0) > 0) warnings.push(`В организации уже есть совпадение ФИО (${found!.name_matches}): проверьте ученика`);
    if ((found?.email_matches || 0) > 0 && !found?.login_taken) warnings.push("Email уже существует: импорт обновит существующего ученика, проверьте его данные");
    if (row.password && (passwords.get(row.password) || 0) > 1) warnings.push("Пароль повторяется в файле: рекомендуется задать разные пароли");
    return { rowIndex: row.rowIndex, blocked: [...new Set(blocked)], warnings: [...new Set(warnings)] };
  });
}
