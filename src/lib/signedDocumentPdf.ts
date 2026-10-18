import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  appendStampPage,
  appendImagePage,
  appendAcceptedEditsListPage,
  applyWatermarkToAllPages,
  type PartyInfo,
  type AcceptedEditSummary,
} from "./pdfStampDrawer";
import { appendHtmlAsRenderedPages } from "./htmlToPdfPages";


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

/** Builds a local download copy. It never stores or replaces signing evidence. */
export async function generateSignedPdf(opts: BuildOptions): Promise<{ path: string; url: string; localCopy: true }> {
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

  if (!documentHtml?.trim() && (!attachedFileUrl || !isPdfMime(attachedFileMime, attachedFileUrl))) {
    throw new Error("Не удалось подтвердить содержимое документа для копии PDF");
  }
  if (signatureMethod === "handwritten_scan" && !scanFileUrl) throw new Error("Сохранённый скан отсутствует; копия не сформирована");

  const { regular, bold } = await loadFonts();

  let pdf: PDFDocument;
  let isAttachedPdf = false;

  // === Сценарий 1: оригинальный документ — PDF ===
  if (attachedFileUrl && isPdfMime(attachedFileMime, attachedFileUrl)) {
    const { bytes } = await fetchBytes(attachedFileUrl);
    try {
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      isAttachedPdf = true;
    } catch {
      throw new Error("Исходный PDF повреждён; копия не сформирована");
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
  if (!bodyPageCount) throw new Error("В исходном документе нет страниц; копия не сформирована");

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
        } catch {
          throw new Error("Скан PDF повреждён; копия не сформирована");
        }
      } else if (isImageMime(scanFileMime || contentType, scanFileUrl)) {
        await appendImagePage(
          pdf,
          bytes,
          scanFileMime || contentType,
          "Скан с собственноручной подписью и печатью",
          fontBold,
        );
      } else {
        throw new Error("Неподдерживаемый формат скана");
      }
    } catch {
      throw new Error("Не удалось добавить сохранённый скан; копия не сформирована");
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

  return { path: "", url: URL.createObjectURL(blob), localCopy: true };
}
