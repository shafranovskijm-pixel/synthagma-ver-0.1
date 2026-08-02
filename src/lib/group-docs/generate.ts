import type { DocType, GeneratedDocument, GenerationContext } from "./schema";
import { buildVariables, findMissing, renderTemplate } from "./variables";
import { getTemplate } from "./templates";

export interface GenerateOptions {
  documentNumber?: string;
  documentDate?: string;
  primaryStudentIndex?: number;
  totalPrice?: number;
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

  const variables = buildVariables(ctx, {
    documentNumber,
    documentDate,
    primaryStudentIndex: opts.primaryStudentIndex,
    totalPrice: opts.totalPrice,
  });

  const html = renderTemplate(tpl.body_html, variables);
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
