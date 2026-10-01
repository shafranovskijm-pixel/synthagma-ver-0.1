import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { ParsedStudentRow } from "@/utils/studentsExcelImport";
import { analyzeStudentImport, type ExistingImportIdentity, type ImportRowCheck } from "@/utils/studentImportPreflight";

/** Check once per import, before any registration, group or enrollment writes. */
export async function assertStudentImportBackendRevision(): Promise<void> {
  // A bodyless GET fails JSON parsing in both v5 and v6 before tenant reads or
  // registration. Use the SDK's configured URL/auth; safeInvoke drops method
  // and the response context needed to verify the exposed revision header.
  const { error, response } = await supabase.functions.invoke("register-student", {
    method: "GET",
    timeout: 10000,
  });
  if (!(error instanceof FunctionsHttpError) || response?.status !== 400
    || response.headers.get("X-Sintagma-Register-Student-Revision") !== "student-import-v6") {
    throw new Error("Импорт временно недоступен: сервер ещё не подтвердил защиту от дублей. Ученики и группы не созданы. Повторите после обновления сервера.");
  }
}

export async function checkStudentImportRows(organizationId: string, rows: ParsedStudentRow[]): Promise<ImportRowCheck[]> {
  const existing: ExistingImportIdentity[] = [];
  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250);
    const { data, error } = await supabase.rpc("student_import_identity_preflight" as any, {
      p_organization_id: organizationId,
      p_rows: batch.map(row => ({ row_index: row.rowIndex, login: row.login || null, full_name: row.full_name, email: row.email || null })),
    });
    if (error) throw new Error("Не удалось проверить дубли: " + error.message);
    if (!Array.isArray(data) || data.length !== batch.length || batch.some(row =>
      data.filter((item: any) => item.row_index === row.rowIndex && typeof item.login_taken === "boolean"
        && Number.isInteger(item.name_matches) && Number.isInteger(item.email_matches)).length !== 1)) {
      throw new Error("Сервер не подтвердил проверку всех строк. Импорт не начат.");
    }
    existing.push(...data as ExistingImportIdentity[]);
  }
  return analyzeStudentImport(rows, existing);
}
