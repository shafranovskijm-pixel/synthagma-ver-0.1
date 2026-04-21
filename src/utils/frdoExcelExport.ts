// ExcelJS (~1 MB) is loaded dynamically inside `exportFRDOExcel`, not on import.
import { format } from "date-fns";

// ===================== DPO HEADERS (exact match to official template, 41 columns) =====================
export const DPO_HEADERS = [
  "Вид документа",
  "Статус документа",
  "Подтверждение утраты",
  "Подтверждение обмена",
  "Подтверждение уничтожения",
  "Серия документа",
  "Номер документа",
  "Дата выдачи документа",
  "Регистрационный номер",
  "Дополнительная профессиональная программа (повышение квалификации/ профессиональная переподготовка)",
  "Наименование дополнительной профессиональной программы",
  "Наименование области профессиональной деятельности",
  "Укрупненные группы специальностей",
  "Наименование квалификации, профессии, специальности",
  "Уровень образования ВО/СПО",
  "Фамилия указанная в дипломе о ВО или СПО",
  "Серия документа о ВО/СПО",
  "Номер документа о ВО/СПО",
  "Год начала обучения (для документа о квалификации)",
  "Год окончания обучения (для документа о квалификации)",
  "Срок обучения, часов (для документа о квалификации)",
  "Фамилия получателя",
  "Имя получателя",
  "Отчество получателя",
  "Дата рождения получателя",
  "Пол получателя",
  "СНИЛС",
  "Форма обучения",
  "Источник финансирования обучения",
  "Форма получения образования на момент прекращения образовательных отношений",
  "Гражданство получателя (код страны по ОКСМ)",
  "Наименование документа об образовании (оригинала)",
  "Серия (оригинала)",
  "Номер (оригинала)",
  "Регистрационный N (оригинала)",
  "Дата выдачи (оригинала)",
  "Фамилия получателя (оригинала)",
  "Имя получателя (оригинала)",
  "Отчество получателя (оригинала)",
  "Номер документа для изменения",
];

// DPO data validations: column index (1-based) -> list of allowed values
export const DPO_VALIDATIONS: Record<number, string[]> = {
  1: ["Удостоверение о повышении квалификации", "Диплом о профессиональной переподготовке"],
  2: ["Оригинал", "Дубликат"],
  3: ["Да", "Нет"],
  4: ["Да", "Нет"],
  5: ["Да", "Нет"],
  10: ["Повышение квалификации", "Профессиональная переподготовка"],
  15: ["Высшее образование", "Среднее профессиональное образование", "Среднее общее образование", "Основное общее образование"],
  26: ["Муж", "Жен"],
  28: ["Очная", "Заочная", "Очно-заочная"],
  29: ["Платное обучение", "Бюджетное обучение"],
  30: ["в образовательной организации", "вне образовательной организации"],
};

// ===================== PO HEADERS (exact match to official template, 35 columns) =====================
export const PO_HEADERS = [
  "Вид документа",
  "Статус документа",
  "Подтверждение утраты",
  "Подтверждение обмена",
  "Подтверждение уничтожения",
  "Серия документа",
  "Номер документа",
  "Дата выдачи документа",
  "Регистрационный номер",
  "Программа профессионального обучения, направление подготовки",
  "Наименование программы профессионального обучения",
  "Наименование профессий рабочих, должностей служащих",
  "Присвоенный квалификационный разряд, класс, категория (при наличии)",
  "Год начала обучения",
  "Год окончания обучения",
  "Срок обучения, часов",
  "Фамилия получателя",
  "Имя получателя",
  "Отчество получателя (при наличии)",
  "Дата рождения получателя",
  "Пол получателя",
  "СНИЛС",
  "Гражданство получателя (код страны по ОКСМ)",
  "Форма обучения",
  "Источник финансирования обучения",
  "Форма получения образования на момент прекращения образовательных отношений",
  "Наименование документа об образовании (оригинала)",
  "Серия (оригинала)",
  "Номер (оригинала)",
  "Регистрационный N (оригинала)",
  "Дата выдачи (оригинала)",
  "Фамилия получателя (оригинала)",
  "Имя получателя (оригинала)",
  "Отчество получателя (оригинала)",
  "Номер документа для изменения",
];

// PO data validations: column index (1-based) -> list of allowed values
export const PO_VALIDATIONS: Record<number, string[]> = {
  1: ["Свидетельство о профессии рабочего, должности служащего"],
  2: ["Оригинал", "Дубликат"],
  3: ["Да", "Нет"],
  4: ["Да", "Нет"],
  5: ["Да", "Нет"],
  10: [
    "Программа профессиональной подготовки по профессии рабочего, должности служащего",
    "Программа переподготовки рабочих, служащих",
    "Программа повышения квалификации рабочих, служащих",
  ],
  21: ["Муж", "Жен"],
  24: ["Очная", "Заочная", "Очно-заочная"],
  25: ["Платное обучение", "Бюджетное обучение"],
  26: ["в образовательной организации", "вне образовательной организации"],
};

/** Build a DPO row as an array of cell values matching DPO_HEADERS order (41 columns) */
export function buildDPORow(data: {
  documentType: string;
  docNumber: string;
  regNumber: string;
  issueDate: string;
  programType: string;
  programName: string;
  professionalArea: string;
  specialtyGroup: string;
  qualificationName: string;
  educationLevel: string;
  educationDocLastName: string;
  educationDocSeries: string;
  educationDocNumber: string;
  startYear: string | number;
  endYear: string | number;
  durationHours: number;
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  snils: string;
  trainingForm: string;
  financingSource: string;
  educationForm: string;
  citizenshipCode: string;
}): (string | number)[] {
  return [
    data.documentType,       // 1
    "Оригинал",              // 2
    "Нет",                   // 3 - Подтверждение утраты
    "Нет",                   // 4 - Подтверждение обмена
    "Нет",                   // 5 - Подтверждение уничтожения
    "нет",                   // 6 - Серия документа
    data.docNumber,          // 7
    data.issueDate,          // 8
    data.regNumber,          // 9
    data.programType,        // 10
    data.programName,        // 11
    data.professionalArea,   // 12
    data.specialtyGroup,     // 13
    data.qualificationName,  // 14
    data.educationLevel,     // 15
    data.educationDocLastName, // 16
    data.educationDocSeries, // 17
    data.educationDocNumber, // 18
    data.startYear,          // 19
    data.endYear,            // 20
    data.durationHours,      // 21
    data.lastName,           // 22
    data.firstName,          // 23
    data.middleName,         // 24
    data.birthDate,          // 25
    data.gender,             // 26
    data.snils,              // 27
    data.trainingForm,       // 28
    data.financingSource,    // 29
    data.educationForm,      // 30
    data.citizenshipCode,    // 31
    "", "", "", "", "", "", "", "", "", // 32-40 (оригинал + номер для изменения)
  ];
}

/** Build a PO row as an array of cell values matching PO_HEADERS order (35 columns) */
export function buildPORow(data: {
  documentType: string;
  docNumber: string;
  regNumber: string;
  issueDate: string;
  programType: string;
  programName: string;
  professionName: string;
  qualificationRank: string;
  startYear: string | number;
  endYear: string | number;
  durationHours: number;
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  snils: string;
  citizenshipCode: string;
  trainingForm: string;
  financingSource: string;
  educationForm: string;
}): (string | number)[] {
  return [
    data.documentType,       // 1
    "Оригинал",              // 2
    "Нет",                   // 3 - Подтверждение утраты
    "Нет",                   // 4 - Подтверждение обмена
    "Нет",                   // 5 - Подтверждение уничтожения
    "Нет",                   // 6 - Серия документа
    data.docNumber,          // 7
    data.issueDate,          // 8
    data.regNumber,          // 9
    data.programType,        // 10
    data.programName,        // 11
    data.professionName,     // 12
    data.qualificationRank,  // 13
    data.startYear,          // 14
    data.endYear,            // 15
    data.durationHours,      // 16
    data.lastName,           // 17
    data.firstName,          // 18
    data.middleName,         // 19
    data.birthDate,          // 20
    data.gender,             // 21
    data.snils,              // 22
    data.citizenshipCode,    // 23
    data.trainingForm,       // 24
    data.financingSource,    // 25
    data.educationForm,      // 26
    "", "", "", "", "", "", "", "", "", // 27-35 (оригинал + номер для изменения)
  ];
}

/** Create and download an Excel file with data validation dropdowns */
export async function exportFRDOExcel(
  rows: (string | number)[][],
  exportType: "dpo" | "po",
  filenameSuffix?: string
) {
  const headers = exportType === "dpo" ? DPO_HEADERS : PO_HEADERS;
  const validations = exportType === "dpo" ? DPO_VALIDATIONS : PO_VALIDATIONS;

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Шаблон");

  // Add header row
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.alignment = { wrapText: true, vertical: "middle" };

  // Set column widths
  headers.forEach((h, i) => {
    const col = worksheet.getColumn(i + 1);
    col.width = Math.min(Math.max(h.length * 1.2, 15), 50);
  });

  // Add data rows
  for (const row of rows) {
    worksheet.addRow(row);
  }

  // Force SNILS column to text format so Excel doesn't convert to number
  const snilsCol = exportType === "dpo" ? 27 : 22;
  const snilsColumn = worksheet.getColumn(snilsCol);
  snilsColumn.numFmt = '@';

  // Apply data validation (dropdowns) — apply to 1000 rows for future use
  const maxRow = Math.max(rows.length + 1, 1000);
  for (const [colStr, allowedValues] of Object.entries(validations)) {
    const col = Number(colStr);
    const formulae = [`"${allowedValues.join(",")}"`];
    for (let r = 2; r <= maxRow; r++) {
      worksheet.getCell(r, col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae,
        showErrorMessage: true,
        errorTitle: "Ошибка",
        error: "Выберите значение из списка",
      };
    }
  }

  // Generate and download file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const suffix = filenameSuffix || format(new Date(), "dd-MM-yyyy");
  const filename = `ФИС_ФРДО_${exportType.toUpperCase()}_${suffix}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatDateForFRDO(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return format(new Date(dateStr), "dd.MM.yyyy");
  } catch {
    return dateStr;
  }
}
