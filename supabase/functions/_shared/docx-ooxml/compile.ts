/**
 * DOCX-first компилятор договора: работает по манифесту прямо в word/document.xml
 * исходного клиентского файла. Никакого DOCX → HTML → DOCX и никакого AI.
 */
import { elementText, findUnresolvedTokens, getBody, replaceTokens, splitTopLevel } from "./xml.ts";
import { formatMoneyRu, moneyToWordsRu } from "./money.ts";

export interface ManifestVariable {
  token: string;
  key: string;
  type: string;
  source: string;
  required: boolean;
  scope?: string;
}

export interface TemplateManifest {
  schema_version: number;
  template_id: string;
  template_version: string;
  scenario: string;
  template_sha256?: string;
  variables: ManifestVariable[];
  repeaters: Record<string, { table_index: number; header_rows: number; prototype_row: number; strategy: string }>;
  conditional_sections?: {
    curricula?: {
      strategy: string;
      catalog: Record<string, { section_index: number; table_index: number; signature_table_index: number }>;
    };
  };
  blocking_rules?: string[];
  lifecycle?: string[];
  qa?: Record<string, unknown>;
}

export interface ContractSnapshot {
  scalars: Record<string, string>;
  programs: Array<Record<string, string>>;
  students: Array<Record<string, string>>;
  /** Названия программ, чьи учебные планы должны остаться приложениями. */
  curricula: string[];
  /** Сумма договора цифрами — источник для сверки PRICE_NUM/PRICE_WORDS. */
  totalAmount: number;
  /** Формулировка НДС выбрана пользователем явно. */
  taxClauseExplicit: boolean;
}

export interface ValidationIssue {
  code: string;
  token?: string;
  key?: string;
  message: string;
}

const norm = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[«»"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function scalarVariables(manifest: TemplateManifest): ManifestVariable[] {
  return manifest.variables.filter((v) => !v.scope);
}

export function scopedVariables(manifest: TemplateManifest, scope: string): ManifestVariable[] {
  return manifest.variables.filter((v) => v.scope === scope);
}

const isEmpty = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** [[N]] — вычисляемый номер строки слушателя. */
export function numberStudents(students: Array<Record<string, string>>): Array<Record<string, string>> {
  return students.map((s, i) => ({ N: String(i + 1), ...s }));
}

/** Блокирующая валидация снимка данных по правилам манифеста. */
export function validateSnapshot(manifest: TemplateManifest, snapshot: ContractSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const students = numberStudents(snapshot.students || []);

  for (const v of scalarVariables(manifest)) {
    const key = v.token.slice(2, -2);
    if (v.required && isEmpty(snapshot.scalars[key])) {
      issues.push({ code: "missing_scalar", token: v.token, key: v.key, message: `Не заполнено обязательное поле: ${v.key}` });
    }
  }

  if (!snapshot.programs?.length) issues.push({ code: "no_programs", message: "Не выбрана ни одна программа обучения" });
  if (!snapshot.students?.length) issues.push({ code: "no_students", message: "Не выбран ни один слушатель" });

  for (const [scope, list] of [["programs[]", snapshot.programs || []], ["students[]", students]] as const) {
    const vars = scopedVariables(manifest, scope);
    list.forEach((item, index) => {
      for (const v of vars) {
        const key = v.token.slice(2, -2);
        if (v.required && isEmpty(item[key])) {
          issues.push({
            code: "missing_row_value",
            token: v.token,
            key: v.key,
            message: `${scope === "students[]" ? "Слушатель" : "Программа"} №${index + 1}: не заполнено ${v.key}`,
          });
        }
      }
    });
  }

  const programTitles = new Set((snapshot.programs || []).map((p) => norm(p.PROG_TITLE)));
  (snapshot.students || []).forEach((s, i) => {
    const t = norm(s.STUDENT_PROGRAM);
    if (t && !programTitles.has(t)) {
      issues.push({ code: "student_program_mismatch", message: `Слушатель №${i + 1}: программа не входит в перечень договора` });
    }
  });

  const amount = Number(snapshot.totalAmount);
  if (!amount || amount <= 0) {
    issues.push({ code: "no_price", key: "payment.total", message: "Не указана стоимость услуг" });
  } else {
    if (snapshot.scalars.PRICE_NUM !== formatMoneyRu(amount)) {
      issues.push({ code: "price_num_mismatch", key: "payment.total.formatted", message: "Сумма цифрами не соответствует стоимости договора" });
    }
    if (snapshot.scalars.PRICE_WORDS !== moneyToWordsRu(amount)) {
      issues.push({ code: "price_words_mismatch", key: "payment.total.words", message: "Сумма прописью не соответствует сумме цифрами" });
    }
  }

  if (!snapshot.taxClauseExplicit) {
    issues.push({ code: "tax_clause_not_explicit", key: "payment.tax_clause", message: "Формулировка НДС должна быть выбрана явно" });
  }

  return issues;
}

interface BodyElement {
  tag: string;
  xml: string;
  sectionIndex: number;
  tableIndex: number | null;
  isSectionBreak: boolean;
}

export function parseBodyElements(documentXml: string): { prefix: string; suffix: string; elements: BodyElement[] } {
  const { prefix, body, suffix } = getBody(documentXml);
  const parts = splitTopLevel(body, ["w:p", "w:tbl", "w:sectPr"]);
  const elements: BodyElement[] = [];
  let sectionIndex = 0;
  let tableIndex = 0;
  for (const p of parts) {
    const isSectionBreak = p.tag === "w:p" && p.xml.includes("<w:sectPr");
    const el: BodyElement = {
      tag: p.tag,
      xml: p.xml,
      sectionIndex,
      tableIndex: p.tag === "w:tbl" ? tableIndex : null,
      isSectionBreak,
    };
    if (p.tag === "w:tbl") tableIndex += 1;
    if (isSectionBreak) sectionIndex += 1;
    elements.push(el);
  }
  return { prefix, suffix, elements };
}

/**
 * Клонирует строку-прототип под каждый элемент списка и удаляет неиспользованные
 * строки (стратегия clone_prototype_remove_unused из манифеста).
 */
export function expandRepeaterTable(
  tableXml: string,
  prototypeRow: number,
  items: Array<Record<string, string>>,
  headerRows = 1,
): string {
  const rows = splitTopLevel(tableXml, ["w:tr"]);
  const proto = rows[prototypeRow];
  if (!proto) throw new Error(`Повторитель: строка-прототип №${prototypeRow} не найдена`);
  const head = rows.slice(0, headerRows).map((r) => r.xml).join("");
  const cloned = items
    .map((item, index) => replaceTokens(uniqueCloneIds(proto.xml, index), item))
    .join("");
  const first = rows[0];
  const last = rows[rows.length - 1];
  return tableXml.slice(0, first.start) + head + cloned + tableXml.slice(last.end);
}

/**
 * Word требует уникальные w14:paraId/textId для клонированных абзацев.
 * С дублями DOCX открывается, но может зависнуть при PDF-экспорте.
 * Идентификаторы вычисляются детерминированно, чтобы результат был
 * воспроизводимым и не требовал crypto/randomUUID в общем Deno/Node-модуле.
 */
export function uniqueCloneIds(xml: string, cloneIndex: number): string {
  let ordinal = 0;
  return xml.replace(/(w14:(?:paraId|textId)=")([0-9A-Fa-f]{8})(")/g, (_all, before, hex, after) => {
    ordinal += 1;
    const base = Number.parseInt(hex, 16) >>> 0;
    let value = (
      base ^ Math.imul(cloneIndex + 1, 0x9e3779b1) ^ Math.imul(ordinal, 0x85ebca77)
    ) >>> 0;
    if (value === 0) value = ordinal;
    return `${before}${value.toString(16).padStart(8, "0").toUpperCase()}${after}`;
  });
}

export interface CompileResult {
  documentXml: string;
  keptCurricula: string[];
  droppedCurricula: string[];
}

/** Заголовок программы учебного плана внутри секции приложения (текст в кавычках «…»). */
export function curriculumTitleOfSection(elements: BodyElement[], sectionIndex: number): string {
  for (const el of elements) {
    if (el.sectionIndex !== sectionIndex || el.tag !== "w:p") continue;
    const text = elementText(el.xml);
    const m = /«([^»]+)»/.exec(text);
    if (m) return m[1].trim();
  }
  return "";
}

export function compileDocumentXml(params: {
  documentXml: string;
  manifest: TemplateManifest;
  snapshot: ContractSnapshot;
}): CompileResult {
  const { manifest, snapshot } = params;
  const issues = validateSnapshot(manifest, snapshot);
  if (issues.length) {
    throw new Error(`Договор не может быть сформирован: ${issues.map((i) => i.message).join("; ")}`);
  }

  const { prefix, suffix, elements } = parseBodyElements(params.documentXml);

  // 1. Повторители — индексы таблиц берутся из исходного документа.
  const repeaters: Array<[string, Array<Record<string, string>>]> = [
    ["programs", snapshot.programs],
    ["students", numberStudents(snapshot.students)],
  ];
  for (const [name, items] of repeaters) {
    const cfg = manifest.repeaters?.[name];
    if (!cfg) continue;
    const target = elements.find((e) => e.tableIndex === cfg.table_index);
    if (!target) throw new Error(`Повторитель ${name}: таблица №${cfg.table_index} не найдена`);
    target.xml = expandRepeaterTable(target.xml, cfg.prototype_row, items, cfg.header_rows ?? 1);
  }

  // 2. Условные приложения: оставляем только учебные планы выбранных программ.
  const catalog = manifest.conditional_sections?.curricula?.catalog || {};
  const requested = new Set((snapshot.curricula || []).map(norm));
  const keptCurricula: string[] = [];
  const droppedCurricula: string[] = [];
  const dropSections = new Set<number>();
  for (const cfg of Object.values(catalog)) {
    const title = curriculumTitleOfSection(elements, cfg.section_index);
    if (title && requested.has(norm(title))) keptCurricula.push(title);
    else { droppedCurricula.push(title || `section#${cfg.section_index}`); dropSections.add(cfg.section_index); }
  }
  const unknown = Array.from(requested).filter(
    (r) => !Object.values(catalog).some((cfg) => norm(curriculumTitleOfSection(elements, cfg.section_index)) === r),
  );
  if (unknown.length) {
    throw new Error(`В шаблоне нет учебного плана для программы: ${unknown.join(", ")}`);
  }

  const kept = elements.filter((e) => !dropSections.has(e.sectionIndex));
  // Последняя секция документа держит финальный <w:sectPr>; его нельзя терять.
  const lastSection = Math.max(...elements.map((e) => e.sectionIndex));
  const bodyXml = dropSections.has(lastSection)
    ? kept.map((e) => e.xml).join("") + elements.filter((e) => e.sectionIndex === lastSection && e.tag === "w:sectPr").map((e) => e.xml).join("")
    : kept.map((e) => e.xml).join("");

  // 3. Скалярные токены.
  const filled = replaceTokens(prefix + bodyXml + suffix, snapshot.scalars);

  const unresolved = findUnresolvedTokens(filled);
  if (unresolved.length) {
    throw new Error(`В документе остались незаполненные токены: ${unresolved.join(", ")}`);
  }

  return { documentXml: filled, keptCurricula, droppedCurricula };
}
