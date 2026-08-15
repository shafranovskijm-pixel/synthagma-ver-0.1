import {
  expandRepeaterTable,
  parseBodyElements,
  uniqueCloneIds,
} from "./compile.ts";
import { findUnresolvedTokens, replaceTokens, splitTopLevel } from "./xml.ts";

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
  repeater: null | {
    table_index: number;
    header_rows: number;
    prototype_row: number;
    continuation_row?: number;
    strategy: string;
  };
  qa?: {
    inspect_all_pages?: boolean;
    preserve_package_parts_except?: string[];
    status?: string;
  };
}

export interface GroupDocumentSnapshot {
  scalars: Record<string, string>;
  rows: Array<Record<string, string>>;
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
  const repeater = params.manifest.repeater;
  if (repeater) {
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
          params.snapshot.rows,
          repeater.header_rows,
        )
      : expandVerticallyMergedRepeater({
          tableXml: target.xml,
          prototypeRow: repeater.prototype_row,
          continuationRow: repeater.continuation_row,
          items: params.snapshot.rows,
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
