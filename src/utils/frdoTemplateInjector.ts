/**
 * FRDO template injector — переносит данные строк в оригинальный xlsx-шаблон ФРДО,
 * сохраняя все валидации, defined names, стили и shared strings.
 *
 * Почему так: ФИС ФРДО проверяет «отпечаток» шаблона (структуру, defined names,
 * dataValidations). Файл, собранный с нуля через ExcelJS, отклоняется как
 * «неизвестный шаблон». Решение — взять оригинальный 262KB шаблон как бинарного
 * донора, распаковать через JSZip и подменить только содержимое <sheetData>
 * первого листа, оставив всё остальное нетронутым.
 *
 * Шаблон-донор лежит в src/assets/frdo/template-po.xlsx (для ПО).
 * Для ДПО шаблон ещё не загружен — fallback на ExcelJS экспорт.
 */
import { format } from "date-fns";

// Vite поддерживает `?url` для любых статических ассетов
import templatePoUrl from "@/assets/frdo/template-po.xlsx?url";
import templateDpoUrl from "@/assets/frdo/template-dpo.xlsx?url";

const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/** Преобразует индекс колонки (0-based) в Excel-обозначение: 0→A, 25→Z, 26→AA */
function columnLetter(index: number): string {
  let s = "";
  let n = index;
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return s;
}

/** Безопасная XML-эскейпизация значения */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Числовые колонки шаблонов ФИС ФРДО (1-based индексы согласно заголовкам).
 * ПО (35 колонок):
 *   14 (N) Год начала обучения, 15 (O) Год окончания, 16 (P) Срок обучения, часов
 * ДПО (40 колонок):
 *   19 (S) Год начала обучения, 20 (T) Год окончания, 21 (U) Срок обучения, часов
 * Всё остальное — текст (включая СНИЛС и даты dd.MM.yyyy).
 */
const PO_NUMERIC_COLS = new Set([14, 15, 16]);
const DPO_NUMERIC_COLS = new Set([19, 20, 21]);

/** Определить, нужно ли значение записать как число */
function isNumericCell(value: unknown, colIndex0: number, type: "po" | "dpo"): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number" && Number.isFinite(value)) {
    const col1 = colIndex0 + 1;
    return type === "po" ? PO_NUMERIC_COLS.has(col1) : DPO_NUMERIC_COLS.has(col1);
  }
  return false;
}

/** Создать XML-строку <row> с inline strings / числовыми ячейками */
function buildRowXml(
  rowNumber: number,
  cells: (string | number)[],
  type: "po" | "dpo",
  cellCount: number,
): string {
  const parts: string[] = [`<row r="${rowNumber}" spans="1:${cellCount}">`];
  cells.forEach((raw, colIdx) => {
    const ref = `${columnLetter(colIdx)}${rowNumber}`;
    if (raw === null || raw === undefined || raw === "") {
      // пустую ячейку не пишем — Excel её не требует
      return;
    }
    if (isNumericCell(raw, colIdx, type)) {
      parts.push(`<c r="${ref}"><v>${raw}</v></c>`);
    } else {
      const text = xmlEscape(String(raw));
      // inlineStr — не зависит от sharedStrings, ничего не ломает
      parts.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`);
    }
  });
  parts.push("</row>");
  return parts.join("");
}

/** Загрузить ArrayBuffer шаблона-донора */
async function fetchTemplateBuffer(type: "po" | "dpo"): Promise<ArrayBuffer | null> {
  const url = type === "po" ? templatePoUrl : templateDpoUrl;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Не удалось загрузить шаблон ${type.toUpperCase()} (${res.status})`);
  }
  return await res.arrayBuffer();
}

/**
 * Главная функция: вливает данные `rows` в копию оригинального шаблона
 * и инициирует скачивание файла в браузере.
 *
 * @returns true если использовался шаблон-донор, false если шаблон отсутствует
 *          (вызывающий код должен сделать fallback на exportFRDOExcel).
 */
export async function injectIntoFrdoTemplate(
  rows: (string | number)[][],
  type: "po" | "dpo",
  filenameSuffix?: string,
): Promise<boolean> {
  const buffer = await fetchTemplateBuffer(type);
  if (!buffer) return false;

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);

  const sheetFile = zip.file("xl/worksheets/sheet1.xml");
  if (!sheetFile) throw new Error("В шаблоне нет xl/worksheets/sheet1.xml");

  const sheetXml = await sheetFile.async("string");

  // Находим блок <sheetData>...</sheetData> и подменяем его целиком.
  // В шаблоне sheetData содержит 1002 строки (заголовок + 1001 пустая) — это
  // нам не нужно, оставим только заголовок и наши данные.
  const sheetDataOpenRe = /<sheetData[^>]*>/;
  const sheetDataOpenMatch = sheetXml.match(sheetDataOpenRe);
  if (!sheetDataOpenMatch) throw new Error("В sheet1.xml не найден <sheetData>");
  const sheetDataOpenIdx = sheetDataOpenMatch.index!;
  const sheetDataOpenLen = sheetDataOpenMatch[0].length;
  const sheetDataCloseIdx = sheetXml.indexOf("</sheetData>", sheetDataOpenIdx);
  if (sheetDataCloseIdx === -1) throw new Error("В sheet1.xml не найден </sheetData>");

  // Сохраняем заголовочную строку (row r="1") как есть — она уже отформатирована
  // и ссылается на стили шаблона. Внутри блока sheetData находим её.
  const innerOriginal = sheetXml.slice(sheetDataOpenIdx + sheetDataOpenLen, sheetDataCloseIdx);
  const headerRowMatch = innerOriginal.match(/<row r="1"[\s\S]*?<\/row>/);
  if (!headerRowMatch) throw new Error("В sheet1.xml не найдена строка заголовка");
  const headerRowXml = headerRowMatch[0];

  // Ширина — берём из первой строки данных, либо стандартное число колонок
  const cellCount = rows[0]?.length ?? (type === "po" ? 35 : 40);

  // Строим новые строки
  const newRowsXml = rows
    .map((row, i) => buildRowXml(i + 2, row, type, cellCount))
    .join("");

  const newSheetData =
    sheetXml.slice(0, sheetDataOpenIdx) +
    sheetDataOpenMatch[0] +
    headerRowXml +
    newRowsXml +
    "</sheetData>" +
    sheetXml.slice(sheetDataCloseIdx + "</sheetData>".length);

  // Обновляем dimension ref на актуальный диапазон, чтобы Excel/ФИС ФРДО
  // не ругались на «битый» dimension. Колонки оставляем оригинальные.
  const lastColLetter = columnLetter(cellCount - 1);
  const lastRow = rows.length + 1; // +1 за заголовок
  const updatedXml = newSheetData.replace(
    /<dimension ref="[^"]+"\/>/,
    `<dimension ref="A1:${lastColLetter}${lastRow}"/>`,
  );

  zip.file("xl/worksheets/sheet1.xml", updatedXml);

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const suffix = filenameSuffix || format(new Date(), "dd-MM-yyyy");
  const filename = `ФИС_ФРДО_${type.toUpperCase()}_${suffix}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return true;
}

/** true, если для данного типа есть шаблон-донор в проекте */
export function hasFrdoTemplate(_type: "po" | "dpo"): boolean {
  return true;
}
