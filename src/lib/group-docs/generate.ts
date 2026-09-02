import type { DocType, GeneratedDocument, GenerationContext } from "./schema";
import { buildVariables, findMissing, renderTemplate } from "./variables";
import { getTemplate } from "./templates";
import {
  LEGACY_LAYOUT_FORMAT,
  LEGACY_LAYOUT_NOTICE,
  documentDataReadiness,
  type DocumentFillMode,
  type GroupFactualData,
} from "./factualData";
import { requiresDocumentNumber, willBeFinalDocument } from "./documentNumbers";
import { localDateIso } from "@/lib/date/localDate";

export interface GenerateOptions {
  /** Явный номер (уже зарезервированный сервером). */
  documentNumber?: string;
  /** Карта зарезервированных номеров по типу документа (для пакета). */
  numbers?: Record<string, string>;
  /** Явные даты отдельных документов; приоритетнее семантики дат группы. */
  documentDates?: Partial<Record<DocType, string>>;
  /** Дата одиночного документа. Не использовать как общую дату пакета. */
  documentDate?: string;
  primaryStudentIndex?: number;
  totalPrice?: number;
  /** Режим заполнения: рабочий бланк или данные Синтагмы. */
  mode?: DocumentFillMode;
  /** Snapshot фактических данных (только источник значений таблиц). */
  factual?: GroupFactualData | null;
  /** Запрошенный статус. Final понижается до draft при неполных данных. */
  requestedStatus?: "draft" | "final";
  packageBatchId?: string | null;
  packageVersion?: number | null;
}

const ENROLLMENT_DATE_TYPES = new Set<DocType>([
  "enrollment_order",
]);

const COMPLETION_DATE_TYPES = new Set<DocType>([
  "expulsion_order",
]);

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Юридическая семантика дат пакета:
 * - приказ о зачислении датируется началом обучения;
 * - приказ о завершении/отчислении датируется окончанием обучения;
 * - у даты оформления журнала отдельного источника в группе нет, поэтому она
 *   должна передаваться явно либо оставаться fallback только для черновика.
 * Для остальных документов отдельной подтверждённой даты-источника в модели
 * пока нет — не приписываем им смысл даты приказа.
 */
export function groupDocumentDate(
  ctx: GenerationContext,
  docType: DocType,
): string | null {
  if (ENROLLMENT_DATE_TYPES.has(docType) && isIsoDate(ctx.group.start_date)) {
    return ctx.group.start_date;
  }
  if (COMPLETION_DATE_TYPES.has(docType) && isIsoDate(ctx.group.end_date)) {
    return ctx.group.end_date;
  }
  return null;
}

export function generateDocument(
  ctx: GenerationContext,
  docType: DocType,
  opts: GenerateOptions = {}
): GeneratedDocument {
  const tpl = getTemplate(docType);
  if (!tpl) throw new Error(`Нет шаблона для типа: ${docType}`);

  const mode: DocumentFillMode = opts.mode ?? "blank";
  const readiness = documentDataReadiness(docType, opts.factual ?? null, ctx.students.length);

  // Статус определяется ДО номера: черновик/бланк не расходует юридическую
  // последовательность и остаётся явно без номера («Черновик»).
  const docStatus: "draft" | "final" = willBeFinalDocument(docType, {
    mode,
    requestedStatus: opts.requestedStatus === "final" ? "final" : "draft",
    finalBlocked: () => readiness?.finalBlocked ?? false,
  })
    ? "final"
    : "draft";

  // Номера выдаёт только сервер (get_next_document_number). Клиентских счётчиков нет.
  const reservedNumber = String(opts.documentNumber || opts.numbers?.[docType] || "").trim();
  if (requiresDocumentNumber(docType) && docStatus === "final" && !reservedNumber) {
    throw new Error(
      `Номер документа не зарезервирован на сервере (${docType}) — генерация отменена`,
    );
  }
  // Черновик номерного документа не носит официальный номер, даже если он передан.
  const documentNumber =
    docStatus === "draft" && requiresDocumentNumber(docType) ? "" : reservedNumber;
  const explicitDocumentDate = opts.documentDates?.[docType] || opts.documentDate;
  const semanticDocumentDate = groupDocumentDate(ctx, docType);
  const requiresSemanticDate = ENROLLMENT_DATE_TYPES.has(docType)
    || COMPLETION_DATE_TYPES.has(docType);
  const documentDate = isIsoDate(explicitDocumentDate)
    ? explicitDocumentDate
    : semanticDocumentDate
      || (docStatus === "draft" || !requiresSemanticDate ? localDateIso() : "");
  if (!documentDate) {
    throw new Error(`Не определена дата итогового документа (${docType})`);
  }

  const variables = buildVariables(ctx, {
    documentNumber,
    documentDate,
    primaryStudentIndex: opts.primaryStudentIndex,
    totalPrice: opts.totalPrice,
    mode,
    factual: opts.factual ?? null,
    docType,
  });


  const rendered = renderTemplate(tpl.body_html, variables);
  // Все девять документов группы — HTML-приближение макета клиента (legacy_html).
  const html =
    docType === "contract"
      ? rendered
      : rendered.replace(
          /<body[^>]*>/i,
          (m) =>
            `${m}\n<div style="border:1px solid #999;padding:8px;margin-bottom:12px;font-size:11px">${LEGACY_LAYOUT_NOTICE}</div>`,
        );
  const missing = findMissing(tpl.body_html, variables);
  if (missing.length > 0) {
    console.warn(`[generate] ${docType}: пустые переменные:`, missing);
  }



  return {
    id: `doc-${docType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    doc_type: docType,
    name: `${tpl.title}${documentNumber ? ` № ${documentNumber}` : ""}`,
    document_number: documentNumber,
    document_date: documentDate,
    variables,
    html,
    status: "active",
    created_at: new Date().toISOString(),
    doc_status: docStatus,
    fill_mode: mode,
    layout_format: docType === "contract" ? "docx_first" : LEGACY_LAYOUT_FORMAT,
    package_batch_id: opts.packageBatchId ?? null,
    package_version: opts.packageVersion ?? null,
    source_note: readiness ? readiness.source : LEGACY_LAYOUT_NOTICE,
  };
}

export function generatePackage(
  ctx: GenerationContext,
  types: DocType[],
  opts: GenerateOptions = {}
): GeneratedDocument[] {
  // `documentDate` относится только к одиночному документу. Старые вызовы не
  // должны размножать одну дату на весь пакет; пакет использует documentDates
  // либо семантические даты начала/окончания группы.
  const packageOptions = { ...opts };
  delete packageOptions.documentDate;
  return types.map((t) => generateDocument(ctx, t, packageOptions));
}

export function downloadHtml(doc: GeneratedDocument): void {
  const blob = new Blob([doc.html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.name.replace(/[^\w\u0400-\u04FF\- ]+/g, "_").slice(0, 80)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function previewHtml(doc: GeneratedDocument): void {
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(doc.html);
    w.document.close();
  }
}
