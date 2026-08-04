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
import { requiresDocumentNumber } from "./documentNumbers";
import { localDateIso } from "@/lib/date/localDate";

export interface GenerateOptions {
  /** Явный номер (уже зарезервированный сервером). */
  documentNumber?: string;
  /** Карта зарезервированных номеров по типу документа (для пакета). */
  numbers?: Record<string, string>;
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
  const documentDate = opts.documentDate || localDateIso();

  const variables = buildVariables(ctx, {
    documentNumber,
    documentDate,
    primaryStudentIndex: opts.primaryStudentIndex,
    totalPrice: opts.totalPrice,
    mode,
    factual: opts.factual ?? null,
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
  return types.map((t) => generateDocument(ctx, t, opts));
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
