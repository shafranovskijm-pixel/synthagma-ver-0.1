import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { supabase } from "@/integrations/supabase/client";
import {
  appendStampPage,
  appendHtmlAsPages,
  appendImagePage,
  type PartyInfo,
} from "./pdfStampDrawer";

const BUCKET = "external-contracts";

interface BuildOptions {
  signatureId: string;
  documentTitle: string;
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

/**
 * Собирает финальный подписанный PDF и сохраняет его в storage.
 * Возвращает { path, url } — путь в бакете и временный signed URL.
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
  } = opts;

  const { regular, bold } = await loadFonts();

  let pdf: PDFDocument;

  // === Сценарий 1: оригинальный документ — PDF ===
  if (attachedFileUrl && isPdfMime(attachedFileMime, attachedFileUrl)) {
    const { bytes } = await fetchBytes(attachedFileUrl);
    try {
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
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

  // === Сценарий 2: HTML-договор → рендерим текстом ===
  if (documentHtml && (!attachedFileUrl || !isPdfMime(attachedFileMime, attachedFileUrl))) {
    appendHtmlAsPages(pdf, documentHtml, documentTitle, font, fontBold);
  }

  // === Скан с собственноручной подписью ===
  if (scanFileUrl) {
    try {
      const { bytes, contentType } = await fetchBytes(scanFileUrl);
      if (isPdfMime(scanFileMime || contentType, scanFileUrl)) {
        // Копируем все страницы скан-PDF в итоговый
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

  const out = await pdf.save();
  const blob = new Blob([out], { type: "application/pdf" });
  const path = `signed/${signatureId}.pdf`;

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

/** Получает кешированный URL подписанного PDF. */
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
