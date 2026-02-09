import ExcelJS from "exceljs";
import { format } from "date-fns";

// ===================== DPO HEADERS (exact match to official template) =====================
export const DPO_HEADERS = [
  "Вид документа",
  "Статус документа",
  "Подтверждение утраты / обмена / уничтожения",
  "Серия документа",
  "Номер документа",
  "Дата выдачи документа",
  "Регистрационный номер документа",
  "Дополнительная профессиональная программа (повышение квалификации/ профессиональная переподготовка)",
  "Наименование дополнительной профессиональной программы",
  "Наименование области профессиональной деятельности",
  "Укрупненные группы специальностей и (или) направлений подготовки",
  "Наименование квалификации, разреза, класса, категории (при наличии)",
  "Уровень имеющегося образования (ВО/СПО)",
  "Фамилия, указанная в документе о ВО или СПО",
  "Серия документа о ВО/СПО",
  "Номер документа о ВО/СПО",
  "Год начала обучения (для документа о квалификации)",
  "Год окончания обучения (для документа о квалификации)",
  "Срок обучения, часов (для документа о квалификации)",
  "Фамилия получателя",
  "Имя получателя",
  "Отчество получателя (при наличии)",
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
  8: ["Повышение квалификации", "Профессиональная переподготовка"],
  13: ["Высшее образование", "Среднее профессиональное образование", "Среднее общее образование", "Основное общее образование"],
  24: ["Муж", "Жен"],
  26: ["Очная", "Заочная", "Очно-заочная"],
  27: ["Платное обучение", "Бюджетное обучение"],
  28: ["в образовательной организации", "вне образовательной организации"],
};

// ===================== PO HEADERS (exact match to official template) =====================
export const PO_HEADERS = [
  "Вид документа",
  "Статус документа",
  "Подтверждение утраты / обмена / уничтожения",
  "Серия документа",
  "Номер документа",
  "Дата выдачи документа",
  "Регистрационный номер документа",
  "Программа профессионального обучения (программа профессиональной подготовки по профессии рабочего, должности служащего/ программа переподготовки рабочих, служащих/ программа повышения квалификации рабочих, служащих)",
  "Наименование программы профессионального обучения",
  "Наименование профессий рабочих, должностей служащих",
  "Присвоенный квалификационный разряд (класс, категория) по результатам профессионального обучения (при наличии)",
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
  8: [
    "Программа профессиональной подготовки по профессии рабочего, должности служащего",
    "Программа переподготовки рабочих, служащих",
    "Программа повышения квалификации рабочих, служащих",
  ],
  19: ["Муж", "Жен"],
  22: ["Очная", "Заочная", "Очно-заочная"],
  23: ["Платное обучение", "Бюджетное обучение"],
  24: ["в образовательной организации", "вне образовательной организации"],
};

/** Build a DPO row as an array of cell values matching DPO_HEADERS order */
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
    data.documentType,
    "Оригинал",
    "Нет",
    "нет",
    data.docNumber,
    data.issueDate,
    data.regNumber,
    data.programType,
    data.programName,
    data.professionalArea,
    data.specialtyGroup,
    data.qualificationName,
    data.educationLevel,
    data.educationDocLastName,
    data.educationDocSeries,
    data.educationDocNumber,
    data.startYear,
    data.endYear,
    data.durationHours,
    data.lastName,
    data.firstName,
    data.middleName,
    data.birthDate,
    data.gender,
    data.snils,
    data.trainingForm,
    data.financingSource,
    data.educationForm,
    data.citizenshipCode,
    "", "", "", "", "", "", "", "", "",
  ];
}

/** Build a PO row as an array of cell values matching PO_HEADERS order */
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
    data.documentType,
    "Оригинал",
    "Нет",
    "Нет",
    data.docNumber,
    data.issueDate,
    data.regNumber,
    data.programType,
    data.programName,
    data.professionName,
    data.qualificationRank,
    data.startYear,
    data.endYear,
    data.durationHours,
    data.lastName,
    data.firstName,
    data.middleName,
    data.birthDate,
    data.gender,
    data.snils,
    data.citizenshipCode,
    data.trainingForm,
    data.financingSource,
    data.educationForm,
    "", "", "", "", "", "", "", "", "",
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

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("ФИС ФРДО");

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
    return format(new Date(dateStr), "M/d/yy");
  } catch {
    return dateStr;
  }
}
