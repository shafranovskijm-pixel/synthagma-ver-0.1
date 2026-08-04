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

export interface GenerateOptions {
  documentNumber?: string;
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

let seq = 100;

function nextNumber(prefix: string, year: number): string {
  seq += 1;
  // Client style: УЦ-4/2026 for orders, 2026-101 for contracts
  if (prefix === "УЦ-") return `УЦ-${seq}/${year}`;
  return `${year}-${String(seq).padStart(3, "0")}`;
}

export function generateDocument(
  ctx: GenerationContext,
  docType: DocType,
  opts: GenerateOptions = {}
): GeneratedDocument {
  const tpl = getTemplate(docType);
  if (!tpl) throw new Error(`Нет шаблона для типа: ${docType}`);

  const year = new Date().getFullYear();
  const defaultPrefix =
    docType === "contract" ? "" :
    docType.includes("order") ? "УЦ-" :
    "";

  const documentNumber = opts.documentNumber || nextNumber(defaultPrefix, year);
  const documentDate = opts.documentDate || new Date().toISOString().slice(0, 10);

  const mode: DocumentFillMode = opts.mode ?? "blank";
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

  const readiness = documentDataReadiness(docType, opts.factual ?? null, ctx.students.length);
  // Финальный статус недоступен при неполных данных — документ остаётся черновиком.
  const docStatus: "draft" | "final" =
    opts.requestedStatus === "final" && mode === "data" && !(readiness?.finalBlocked ?? false)
      ? "final"
      : "draft";

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
