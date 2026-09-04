import {
  expandRepeaterTable,
  parseBodyElements,
  uniqueCloneIds,
} from "./compile.ts";
import { shortNameRu } from "./money.ts";
import { findUnresolvedTokens, replaceTokens, splitTopLevel } from "./xml.ts";

export interface GroupDocumentRepeater {
  table_index: number;
  header_rows: number;
  prototype_row: number;
  continuation_row?: number;
  minimum_rows?: number;
  strategy: string;
}

export interface GroupDocumentSourceRepeater extends GroupDocumentRepeater {
  row_source_key: string;
  row_tokens: string[];
  /** Number reserve rows only when the retained blank form does so. */
  number_blank_rows: boolean;
}

export interface GroupDocumentManifest {
  schema_version: number;
  template_id: string;
  template_version: string;
  scenario: string;
  template_sha256: string;
  source_filename: string;
  source_sha256: string;
  header_source_filename?: string;
  header_source_sha256?: string;
  header_source_part?: string;
  header_source_rels_part?: string;
  fidelity_status: "beta_screenshot_reconstruction" | string;
  orientation: "portrait" | "landscape";
  row_source_key: string | null;
  row_tokens: string[];
  repeater: GroupDocumentRepeater | null;
  /** Schema 2: each table has an independent, explicit server row source. */
  repeaters?: GroupDocumentSourceRepeater[];
  qa?: {
    inspect_all_pages?: boolean;
    preserve_package_parts_except?: string[];
    status?: string;
    renderer?: string;
    rendered_pages?: number;
    evidence?: string;
  };
}

export interface GroupDocumentSnapshot {
  scalars: Record<string, string>;
  rows: Array<Record<string, string>>;
  rowsBySource?: Record<string, Array<Record<string, string>>>;
}

export interface DocumentSignatoryInput {
  position: string;
  name: string;
}

export interface LegacyDocumentMetadataInput {
  docType?: string;
  fillMode: "blank" | "data";
  docStatus: "draft" | "final";
  documentNumber?: string | null;
  documentDate?: string | null;
  /** true только после tenant-scoped перечитывания критичных данных сервером. */
  serverVerifiedCriticalRequisites?: boolean;
  serverVerificationMessage?: string | null;
}

export interface CanonicalLegacyDocumentMetadata {
  docStatus: "draft" | "final";
  documentNumber: string | null;
  statusWarning: string | null;
}

export function resolveLegacyDocumentDate(input: {
  documentDate?: string | null;
  legacySharedDraftDate?: string | null;
  fillMode: "blank" | "data";
  docStatus: "draft" | "final";
}): string | null {
  const ownDate = String(input.documentDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(ownDate)) return ownDate;

  // Старые клиенты отправляли одну дату пакета. Она допустима только для
  // рабочего бланка/черновика и никогда не подтверждает итоговый документ.
  const legacyDraftDate = String(input.legacySharedDraftDate || "").trim();
  if (
    input.fillMode === "blank"
    && input.docStatus === "draft"
    && /^\d{4}-\d{2}-\d{2}$/.test(legacyDraftDate)
  ) {
    return legacyDraftDate;
  }
  return null;
}

/**
 * Server-side integrity gate for metadata received from the legacy HTML
 * generator. Browser-supplied `final` is only retained after the Edge function
 * has independently confirmed critical requisites from tenant-scoped DB rows.
 * The function never promotes a client draft to final.
 */
export function canonicalizeLegacyDocumentMetadata(
  input: LegacyDocumentMetadataInput,
): CanonicalLegacyDocumentMetadata {
  const requiresFinalOrderRequisites =
    input.docType === "enrollment_order" || input.docType === "expulsion_order";
  const hasFinalDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.documentDate || "").trim());
  const hasFinalOrderNumber = !requiresFinalOrderRequisites
    || String(input.documentNumber || "").trim() !== "";
  const requestedFinal = input.fillMode === "data" && input.docStatus === "final";
  const isFinalData = input.fillMode === "data"
    && input.docStatus === "final"
    && input.serverVerifiedCriticalRequisites === true
    && hasFinalDate
    && hasFinalOrderNumber;

  const downgradeReasons: string[] = [];
  if (requestedFinal && input.serverVerifiedCriticalRequisites !== true) {
    downgradeReasons.push(
      input.serverVerificationMessage?.trim()
      || "сервер не подтвердил критические реквизиты по данным организации",
    );
  }
  if (requestedFinal && !hasFinalDate) downgradeReasons.push("не указана отдельная дата документа");
  if (requestedFinal && !hasFinalOrderNumber) downgradeReasons.push("не подтверждён номер приказа");

  return {
    docStatus: isFinalData ? "final" : "draft",
    documentNumber: isFinalData ? String(input.documentNumber || "").trim() || null : null,
    statusWarning: requestedFinal && !isFinalData
      ? `Итоговый статус не подтверждён: ${downgradeReasons.join("; ")}. Документ сохранён как черновик.`
      : null,
  };
}

/** Canonical metadata scalars override any same-named values from client variables. */
export function buildCanonicalDocumentMetadataScalars(input: {
  documentNumber?: string | null;
  documentDate?: string | null;
}): { ORDER_NUMBER: string; ORDER_DATE: string } {
  const isoDate = String(input.documentDate || "").trim();
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return {
    ORDER_NUMBER: String(input.documentNumber || "").trim(),
    ORDER_DATE: match ? `${match[3]}.${match[2]}.${match[1]}` : "",
  };
}

export function firstPositiveFiniteNumber(...values: unknown[]): number {
  for (const value of values) {
    const candidate = Number(value);
    if (Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return 0;
}

export type GoreltechCompiledDocumentType =
  | "enrollment_order"
  | "expulsion_order"
  | "student_list"
  | "class_journal"
  | "schedule"
  | "attestation_sheet"
  | "registration_book"
  | "title_page"
  | "pass";

export interface GroupDocumentPrerequisiteContext {
  org_name: unknown;
  group_number: unknown;
  program_title: unknown;
  program_hours: unknown;
  start_date: unknown;
  end_date: unknown;
  instructor_name: unknown;
  training_dates: unknown[];
  students_count: number;
}

export interface GroupDocumentPrerequisiteIssue {
  code: "missing_prerequisite" | "invalid_training_dates_count";
  field: string;
  message: string;
}

const REQUIRED_PREREQUISITES: Record<
  GoreltechCompiledDocumentType,
  Array<Exclude<keyof GroupDocumentPrerequisiteContext, "training_dates"> | "training_dates_4">
> = {
  enrollment_order: [
    "org_name",
    "group_number",
    "program_title",
    "program_hours",
    "start_date",
    "end_date",
    "students_count",
  ],
  expulsion_order: [
    "org_name",
    "group_number",
    "program_title",
    "program_hours",
    "start_date",
    "end_date",
    "students_count",
  ],
  student_list: ["org_name", "group_number", "program_title", "students_count"],
  class_journal: [
    "org_name",
    "group_number",
    "program_title",
    "program_hours",
    "instructor_name",
    "training_dates_4",
    "students_count",
  ],
  schedule: ["program_title", "program_hours", "instructor_name"],
  attestation_sheet: [
    "org_name",
    "group_number",
    "program_title",
    "program_hours",
    "start_date",
    "end_date",
    "instructor_name",
    "students_count",
  ],
  registration_book: [
    "org_name",
    "group_number",
    "program_title",
    "start_date",
    "end_date",
    "students_count",
  ],
  title_page: ["org_name", "group_number", "program_title", "start_date", "end_date"],
  pass: [
    "org_name",
    "group_number",
    "program_title",
    "program_hours",
    "start_date",
    "end_date",
    "students_count",
  ],
};

const PREREQUISITE_LABELS: Record<string, string> = {
  org_name: "наименование организации",
  group_number: "номер группы",
  program_title: "наименование программы",
  program_hours: "объём программы в часах",
  start_date: "дата начала обучения",
  end_date: "дата окончания обучения",
  instructor_name: "ФИО преподавателя",
  students_count: "слушатели группы",
};

export function validateGroupDocumentPrerequisites(params: {
  docType: GoreltechCompiledDocumentType;
  fillMode: "blank" | "data";
  context: GroupDocumentPrerequisiteContext;
}): GroupDocumentPrerequisiteIssue[] {
  const issues: GroupDocumentPrerequisiteIssue[] = [];
  for (const field of REQUIRED_PREREQUISITES[params.docType]) {
    if (field === "training_dates_4") {
      if (params.fillMode === "blank") continue;
      const count = params.context.training_dates
        .map((value) => String(value || "").trim())
        .filter(Boolean).length;
      if (count !== 4) {
        issues.push({
          code: "invalid_training_dates_count",
          field,
          message: "для журнала нужно указать ровно четыре даты занятий",
        });
      }
      continue;
    }

    const value = params.context[field];
    const missing = field === "students_count"
      ? !Number.isFinite(Number(value)) || Number(value) <= 0
      : field === "program_hours"
        ? !Number.isFinite(Number(value)) || Number(value) <= 0
        : String(value || "").trim() === "";
    if (missing) {
      issues.push({
        code: "missing_prerequisite",
        field,
        message: `не заполнено обязательное поле: ${PREREQUISITE_LABELS[field]}`,
      });
    }
  }
  return issues;
}

export function resolveDocumentSignatory(
  override: DocumentSignatoryInput | undefined,
  organization: { director_position?: unknown; director_name?: unknown },
): { position: string; shortName: string; source: "request" | "organization_default" } {
  if (override !== undefined) {
    return {
      position: override.position.trim(),
      shortName: shortNameRu(override.name.trim()),
      source: "request",
    };
  }
  return {
    position: String(organization.director_position || "").trim(),
    shortName: shortNameRu(String(organization.director_name || "").trim()),
    source: "organization_default",
  };
}

function preserveMinimumRows(
  rows: Array<Record<string, string>>,
  rowTokens: string[],
  minimumRows = 0,
  numberBlankRows = true,
): Array<Record<string, string>> {
  const result = rows.map((row, index) => ({
    ...row,
    ...(rowTokens.includes("N") && !String(row.N || "").trim()
      ? { N: String(index + 1) }
      : {}),
  }));
  while (result.length < minimumRows) {
    const blank = Object.fromEntries(rowTokens.map((token) => [token, ""]));
    if (numberBlankRows && rowTokens.includes("N")) blank.N = String(result.length + 1);
    result.push(blank);
  }
  return result;
}

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converts only the generated table cells to plain text; raw HTML never enters DOCX. */
export function parseGeneratedHtmlRows(
  html: unknown,
  rowTokens: string[],
): Array<Record<string, string>> {
  const source = String(html || "");
  const rows: Array<Record<string, string>> = [];
  for (const match of source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi))
      .map((cell) => decodeHtml(cell[1]));
    if (!cells.length) continue;
    const row: Record<string, string> = {};
    rowTokens.forEach((token, index) => {
      row[token] = cells[index] || "";
    });
    rows.push(row);
  }
  return rows;
}

const ROSTER_ROW_DOCUMENTS = new Set<GoreltechCompiledDocumentType>([
  "enrollment_order",
  "expulsion_order",
  "student_list",
  "attestation_sheet",
  "registration_book",
  "pass",
]);

function normalizedRosterName(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/**
 * Fail-closed gate for the legacy HTML transport. The five documents listed
 * above must contain exactly the same active students that were re-read by the
 * Edge function immediately before compilation. This prevents a stale browser
 * tab (or an archived profile) from producing a valid-looking Word package.
 */
export function validateStudentRowsAgainstRoster(params: {
  docType: GoreltechCompiledDocumentType;
  fillMode: "blank" | "data";
  rows: Array<Record<string, string>>;
  activeStudentNames: unknown[];
}): string | null {
  if (!ROSTER_ROW_DOCUMENTS.has(params.docType)) return null;

  const expected = params.activeStudentNames
    .map(normalizedRosterName)
    .sort((left, right) => left.localeCompare(right, "ru"));
  const actual = params.rows
    .map((row) => normalizedRosterName(row.STUDENT_NAME))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ru"));

  if (expected.some((name) => !name)) {
    return "У активного ученика не заполнено ФИО";
  }
  if (params.docType === "registration_book" && params.fillMode === "data") {
    const expectedNames = new Set(expected);
    if (actual.some((name) => !expectedNames.has(name))) {
      return "Книга регистрации содержит ученика, которого нет в активном составе группы";
    }
    return null;
  }
  if (
    expected.length !== actual.length
    || expected.some((name, index) => name !== actual[index])
  ) {
    return "Состав или ФИО учеников изменились. Обновите страницу перед формированием документов";
  }
  return null;
}

export function buildGroupDocumentScalars(
  variables: Record<string, unknown>,
): Record<string, string> {
  const scalars: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables || {})) {
    scalars[key.toUpperCase()] = value === null || value === undefined ? "" : String(value);
  }

  const orgName = scalars.ORG_NAME || "";
  const orgShort = scalars.ORG_SHORT_NAME || orgName;
  if (/ГОРЭЛТЕХ/i.test(orgName)) {
    scalars.ORG_HEADER_LINE_1 =
      "Учебный центр Общества с ограниченной ответственностью «Инжиниринговый центр «ГОРЭЛТЕХ»";
    scalars.ORG_HEADER_LINE_2 = `(${orgShort})`;
  } else {
    scalars.ORG_HEADER_LINE_1 = orgName;
    scalars.ORG_HEADER_LINE_2 = "";
  }

  const scheduleRows = parseGeneratedHtmlRows(variables.schedule_rows, [
    "DATE",
    "TIME",
    "TOPIC",
    "HOURS",
    "TEACHER",
  ]);
  for (let index = 0; index < 4; index += 1) {
    const row = scheduleRows[index] || {};
    const suffix = String(index + 1);
    scalars[`SCHEDULE_DATE_${suffix}`] = row.DATE || "";
    scalars[`SCHEDULE_TIME_${suffix}`] = row.TIME || "";
    scalars[`SCHEDULE_TOPIC_${suffix}`] = row.TOPIC || "";
    scalars[`SCHEDULE_HOURS_${suffix}`] = row.HOURS || "";
    scalars[`SCHEDULE_TEACHER_${suffix}`] = row.TEACHER || "";
  }
  return scalars;
}

function expandVerticallyMergedRepeater(params: {
  tableXml: string;
  prototypeRow: number;
  continuationRow: number;
  items: Array<Record<string, string>>;
  headerRows: number;
}): string {
  const rows = splitTopLevel(params.tableXml, ["w:tr"]);
  const prototype = rows[params.prototypeRow];
  const continuation = rows[params.continuationRow];
  if (!prototype || !continuation) {
    throw new Error("Повторитель объединённой таблицы: строки-прототипы не найдены");
  }
  const head = rows.slice(0, params.headerRows).map((row) => row.xml).join("");
  const cloned = params.items
    .map((item, index) => {
      const source = index === 0 ? prototype.xml : continuation.xml;
      return replaceTokens(uniqueCloneIds(source, index), item);
    })
    .join("");
  const first = rows[0];
  const last = rows[rows.length - 1];
  return params.tableXml.slice(0, first.start) + head + cloned + params.tableXml.slice(last.end);
}

export function compileGroupDocumentXml(params: {
  documentXml: string;
  manifest: GroupDocumentManifest;
  snapshot: GroupDocumentSnapshot;
}): string {
  const parsed = parseBodyElements(params.documentXml);
  // Preserve the legacy single-table contract. Multi-table sources are explicit:
  // a missing array must never fall back to the common roster or scalar tokens.
  if (params.manifest.repeaters !== undefined) {
    if (params.manifest.repeater || params.manifest.schema_version !== 2
      || !Array.isArray(params.manifest.repeaters) || params.manifest.repeaters.length === 0) {
      throw new Error("Шаблон: недопустимое сочетание single/multi повторителей или версия схемы");
    }
    const tableIds = new Set<number>();
    const sourceKeys = new Set<string>();
    for (const repeater of params.manifest.repeaters) {
      if (!repeater || !Number.isInteger(repeater.table_index) || repeater.table_index < 0
        || !Number.isInteger(repeater.header_rows) || repeater.header_rows < 0
        || !Number.isInteger(repeater.prototype_row) || repeater.prototype_row < repeater.header_rows
        || (repeater.continuation_row !== undefined && (!Number.isInteger(repeater.continuation_row)
          || repeater.continuation_row <= repeater.prototype_row))
        || (repeater.minimum_rows !== undefined && (!Number.isInteger(repeater.minimum_rows) || repeater.minimum_rows < 0))
        || repeater.strategy !== "clone_prototype_preserve_minimum_rows"
        || typeof repeater.number_blank_rows !== "boolean"
        || typeof repeater.row_source_key !== "string" || !/^[a-z][a-z0-9_]*$/.test(repeater.row_source_key)
        || !Array.isArray(repeater.row_tokens) || !repeater.row_tokens.length
        || repeater.row_tokens.some((token) => typeof token !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(token))
        || new Set(repeater.row_tokens).size !== repeater.row_tokens.length) {
        throw new Error("Шаблон: некорректное описание независимого повторителя");
      }
      if (tableIds.has(repeater.table_index) || sourceKeys.has(repeater.row_source_key)) {
        throw new Error("Шаблон: повторяются таблица или источник строк");
      }
      tableIds.add(repeater.table_index);
      sourceKeys.add(repeater.row_source_key);
      const sources = params.snapshot.rowsBySource;
      if (!sources || !Object.prototype.hasOwnProperty.call(sources, repeater.row_source_key)
        || !Array.isArray(sources[repeater.row_source_key])) {
        throw new Error(`Не подтверждён отдельный источник строк: ${repeater.row_source_key}`);
      }
      const sourceRows = sources[repeater.row_source_key];
      if (sourceRows.some((row) => !row || typeof row !== "object" || Array.isArray(row)
        || repeater.row_tokens.some((token) => !Object.prototype.hasOwnProperty.call(row, token) || typeof row[token] !== "string"))) {
        throw new Error(`Некорректные поля источника строк: ${repeater.row_source_key}`);
      }
      const target = parsed.elements.find((element) => element.tableIndex === repeater.table_index);
      if (!target) throw new Error(`Шаблон ${params.manifest.template_id}: таблица №${repeater.table_index} не найдена`);
      const rows = preserveMinimumRows(sourceRows, repeater.row_tokens, repeater.minimum_rows, repeater.number_blank_rows);
      target.xml = repeater.continuation_row === undefined
        ? expandRepeaterTable(target.xml, repeater.prototype_row, rows, repeater.header_rows)
        : expandVerticallyMergedRepeater({ tableXml: target.xml, prototypeRow: repeater.prototype_row,
          continuationRow: repeater.continuation_row, items: rows, headerRows: repeater.header_rows });
    }
  }
  const repeater = params.manifest.repeater;
  if (repeater) {
    const rows = preserveMinimumRows(
      params.snapshot.rows,
      params.manifest.row_tokens,
      repeater.minimum_rows,
    );
    const target = parsed.elements.find((element) => element.tableIndex === repeater.table_index);
    if (!target) {
      throw new Error(
        `Шаблон ${params.manifest.template_id}: таблица №${repeater.table_index} не найдена`,
      );
    }
    target.xml = repeater.continuation_row === undefined
      ? expandRepeaterTable(
          target.xml,
          repeater.prototype_row,
          rows,
          repeater.header_rows,
        )
      : expandVerticallyMergedRepeater({
          tableXml: target.xml,
          prototypeRow: repeater.prototype_row,
          continuationRow: repeater.continuation_row,
          items: rows,
          headerRows: repeater.header_rows,
        });
  }

  const compiled = replaceTokens(
    parsed.prefix + parsed.elements.map((element) => element.xml).join("") + parsed.suffix,
    params.snapshot.scalars,
  );
  const unresolved = findUnresolvedTokens(compiled);
  if (unresolved.length) {
    throw new Error(
      `В ${params.manifest.template_id} остались незаполненные токены: ${unresolved.join(", ")}`,
    );
  }
  return compiled;
}
