/**
 * Dynamically loads xlsx library to avoid ~800KB in initial bundle.
 * Use this in export/import functions instead of static `import * as XLSX from "xlsx"`.
 */
export async function getXLSX() {
  const XLSX = await import("xlsx");
  return XLSX;
}

/**
 * Helper to export data as Excel file using dynamic xlsx import.
 */
export async function exportToExcel(
  data: Record<string, any>[],
  sheetName: string,
  fileName: string,
  columnWidths?: { wch: number }[]
) {
  const XLSX = await getXLSX();
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  if (columnWidths) {
    worksheet["!cols"] = columnWidths;
  }

  XLSX.writeFile(workbook, fileName);
}
