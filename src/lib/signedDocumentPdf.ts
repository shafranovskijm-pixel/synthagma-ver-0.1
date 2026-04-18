import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { supabase } from "@/integrations/supabase/client";
import {
  appendStampPage,
  appendImagePage,
  appendAcceptedEditsListPage,
  applyWatermarkToAllPages,
  type PartyInfo,
  type AcceptedEditSummary,
} from "./pdfStampDrawer";
import { appendHtmlAsRenderedPages } from "./htmlToPdfPages";
import { sha256Hex } from "@/utils/documentHash";

const BUCKET = "external-contracts";

interface BuildOptions {
  signatureId: string;
  documentTitle: string;
  /** HTML, уже с применёнными принятыми правками (или исходный, если правок нет). */
  documentHtml?: string | null;
  /** Полный URL (signed) к оригинальному файлу-договору. */
  attachedFileUrl?: string | null;
  /** MIME оригинального файла-договора (если известен). */
  attachedFileMime?: string | null;
  /** Полный URL (signed) к скан-листу с собственноручной подписью. */
  scanFileUrl?: string | null;
  scanFileMime?: string | null;
  signatureMethod: "pep" | "handwritten_scan";
  sender?: PartyInfo;
  recipient?: PartyInfo;
  /** Список принятых правок — для PDF-вложений добавим отдельную страницу-список. */
  acceptedEdits?: AcceptedEditSummary[];
}

let cachedFonts: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

async function loadFonts(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  if (cachedFonts) return cachedFonts;
  const [r, b] = await Promise.all([
    fetch("/fonts/PTSans-Regular.ttf").then((r) => {
      if (!r.ok) throw new Error("Не удалось загрузить шрифт PTSans-Regular.ttf");
      return r.arrayBuffer();
    }),
    fetch("/fonts/PTSans-Bold.ttf").then((r) => {
      if (!r.ok) throw new Error("Не удалось загрузить шрифт PTSans-Bold.ttf");
      return r.arrayBuffer();
    }),
  ]);
  cachedFonts = { regular: r, bold: b };
  return cachedFonts;
}

async function fetchBytes(url: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось скачать файл (${res.status})`);
  const ct = res.headers.get("content-type") || "";
  const bytes = await res.arrayBuffer();
  return { bytes, contentType: ct };
}

function isPdfMime(mime: string | null | undefined, url: string | null | undefined): boolean {
  if (mime && mime.toLowerCase().includes("pdf")) return true;
  if (url && url.toLowerCase().split("?")[0].endsWith(".pdf")) return true;
  return false;
}

function isImageMime(mime: string | null | undefined, url: string | null | undefined): boolean {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  const lo = (url || "").toLowerCase().split("?")[0];
  return /\.(png|jpe?g|webp|gif)$/.test(lo);
}

/** Считает короткий хэш входов сборки PDF — для инвалидации кеша. */
async function computeBuildHash(opts: BuildOptions): Promise<string> {
  const payload = JSON.stringify({
    renderer: "v2", // bump → инвалидирует старые «уродливые» PDF
    html: opts.documentHtml || "",
    attached: opts.attachedFileUrl?.split("?")[0] || "",
    scan: opts.scanFileUrl?.split("?")[0] || "",
    method: opts.signatureMethod,
    sender: opts.sender || null,
    recipient: opts.recipient || null,
    edits: (opts.acceptedEdits || []).map((e) => ({
      k: e.kind, b: e.before || "", a: e.after || "",
    })),
  });
  const full = await sha256Hex(payload);
  return full.slice(0, 10);
}

/**
 * Собирает финальный подписанный PDF и сохраняет его в storage.
 * Возвращает { path, url } — путь в бакете и временный signed URL.
 *
 * Кеширование: имя файла включает хэш входов. При смене hash — пересборка.
 */
export async function generateSignedPdf(opts: BuildOptions): Promise<{ path: string; url: string }> {
  const {
    signatureId,
    documentTitle,
    documentHtml,
    attachedFileUrl,
    attachedFileMime,
    scanFileUrl,
    scanFileMime,
    signatureMethod,
    sender,
    recipient,
    acceptedEdits,
  } = opts;

  const buildHash = await computeBuildHash(opts);
  const path = `signed/${signatureId}_${buildHash}.pdf`;

  // Если файл уже есть с актуальным хэшем — отдаём его (кеш-хит).
  try {
    const { data: existing } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (existing?.signedUrl) {
      // Проверим, что файл реально существует — createSignedUrl может вернуть URL даже для отсутствующего файла
      const head = await fetch(existing.signedUrl, { method: "HEAD" });
      if (head.ok) {
        await supabase
          .from("document_signatures")
          .update({ signed_document_path: path })
          .eq("id", signatureId);
        return { path, url: existing.signedUrl };
      }
    }
  } catch {
    /* ignore — собираем заново */
  }

  const { regular, bold } = await loadFonts();

  let pdf: PDFDocument;
  let isAttachedPdf = false;

  // === Сценарий 1: оригинальный документ — PDF ===
  if (attachedFileUrl && isPdfMime(attachedFileMime, attachedFileUrl)) {
    const { bytes } = await fetchBytes(attachedFileUrl);
    try {
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      isAttachedPdf = true;
    } catch (e) {
      console.warn("[generateSignedPdf] PDF load failed, fallback to fresh doc", e);
      pdf = await PDFDocument.create();
    }
  } else {
    pdf = await PDFDocument.create();
  }

  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(regular, { subset: true });
  const fontBold = await pdf.embedFont(bold, { subset: true });

  // === Сценарий 2: HTML-договор → рендерим через браузер (html2canvas) ===
  if (documentHtml && (!attachedFileUrl || !isPdfMime(attachedFileMime, attachedFileUrl))) {
    await appendHtmlAsRenderedPages(pdf, documentHtml, documentTitle);
  }

  // Запоминаем сколько страниц «тела документа» уже есть — на них пойдёт watermark
  const bodyPageCount = pdf.getPageCount();

  // === Для PDF-вложений: список принятых правок отдельной страницей ===
  if (isAttachedPdf && acceptedEdits && acceptedEdits.length > 0) {
    appendAcceptedEditsListPage(pdf, acceptedEdits, font, fontBold);
  }
  const editsPagesEnd = pdf.getPageCount();

  // === Скан с собственноручной подписью ===
  if (scanFileUrl) {
    try {
      const { bytes, contentType } = await fetchBytes(scanFileUrl);
      if (isPdfMime(scanFileMime || contentType, scanFileUrl)) {
        try {
          const scanPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const copied = await pdf.copyPages(scanPdf, scanPdf.getPageIndices());
          copied.forEach((p) => pdf.addPage(p));
        } catch (e) {
          console.warn("[generateSignedPdf] scan PDF copy failed", e);
        }
      } else if (isImageMime(scanFileMime || contentType, scanFileUrl)) {
        await appendImagePage(
          pdf,
          bytes,
          scanFileMime || contentType,
          "Скан с собственноручной подписью и печатью",
          fontBold,
        );
      }
    } catch (e) {
      console.warn("[generateSignedPdf] scan fetch failed", e);
    }
  }

  // === Финальная страница со штампами сторон ===
  appendStampPage(pdf, sender, recipient, {
    font,
    fontBold,
    signatureMethod,
    documentTitle,
  });

  // === Watermark с подписью на каждой странице (тело + скан) ===
  // Пропускаем: страницы со списком принятых правок и финальную страницу штампов.
  const skip = new Set<number>();
  for (let i = bodyPageCount; i < editsPagesEnd; i++) skip.add(i);
  skip.add(pdf.getPageCount() - 1);
  applyWatermarkToAllPages(pdf, sender, recipient, font, fontBold, signatureMethod, skip);

  const out = await pdf.save();
  const blob = new Blob([out as BlobPart], { type: "application/pdf" });

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  // Запоминаем путь в БД (без блокировки на ошибке)
  await supabase
    .from("document_signatures")
    .update({ signed_document_path: path })
    .eq("id", signatureId);

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);

  return { path, url: signed?.signedUrl || "" };
}

/**
 * Получает кешированный URL подписанного PDF.
 * Принимает путь, сохранённый ранее в `signed_document_path`.
 * Внимание: вызывающий код должен сравнить хэш в имени файла с актуальным
 * (см. `computeBuildHash`) — если не совпало, нужно вызвать `generateSignedPdf`.
 */
export async function getCachedSignedPdfUrl(
  signedDocumentPath: string | null | undefined,
): Promise<string | null> {
  if (!signedDocumentPath) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(signedDocumentPath, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}
