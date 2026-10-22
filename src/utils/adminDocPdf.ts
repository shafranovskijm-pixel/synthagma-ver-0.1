import { captureDocumentOutputFence } from '@/lib/documents/outputFence';
import { createSafePrintFrame } from './printHtmlToPdf';
import { HtmlPrintError } from './printHtmlSafety';
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Рендерит произвольный HTML-документ (полная страница с <html>/<body>)
 * во временный оффскрин-iframe, снимает html2canvas и нарезает на A4 листы.
 * Возвращает Blob PDF (или скачивает, если fileName задан).
 */
export async function renderHtmlToPdf(html: string, fileName?: string): Promise<Blob> {
  const assertCurrent = captureDocumentOutputFence(); assertCurrent();
  const frame = await createSafePrintFrame(html, fileName, { rasterImages: true });
  let active = true;
  const assertActive = () => { assertCurrent(); if (!active) throw new HtmlPrintError('TIMED_OUT'); };
  const render = async (): Promise<Blob> => {
    assertActive();
    const doc = frame.document;
    // Freeze successfully loaded CORS-safe images into local bytes. html2canvas
    // must not silently skip a remote stamp/signature or make another request.
    for (const image of Array.from(doc.images)) {
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 25000000) throw new HtmlPrintError('RESOURCE_FAILED');
      const imageCanvas = document.createElement('canvas'); imageCanvas.width = image.naturalWidth; imageCanvas.height = image.naturalHeight;
      const imageContext = imageCanvas.getContext('2d'); if (!imageContext) throw new HtmlPrintError('RESOURCE_FAILED');
      try { imageContext.drawImage(image, 0, 0); image.src = imageCanvas.toDataURL('image/png'); if (typeof image.decode === 'function') await image.decode(); }
      catch { throw new HtmlPrintError('RESOURCE_FAILED', 'Не удалось включить изображение или подпись в PDF. Проверьте доступ к исходнику; неполный PDF не сохранён.'); }
      assertActive();
    }
    const target = (doc.querySelector(".doc") as HTMLElement) || doc.body;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: target.scrollWidth,
    });

    assertActive();
    if (!canvas.width || !canvas.height) throw new HtmlPrintError('RESOURCE_FAILED');
    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pageH) {
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, imgW, imgH);
    } else {
      // Нарежем canvas на страницы
      const pageCanvasHeightPx = Math.floor((canvas.width * pageH) / pageW);
      let offset = 0;
      let first = true;
      while (offset < canvas.height) {
        const sliceH = Math.min(pageCanvasHeightPx, canvas.height - offset);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext("2d"); if (!ctx) throw new HtmlPrintError('RESOURCE_FAILED');
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, offset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const h = (sliceH * imgW) / canvas.width;
        if (!first) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, imgW, h);
        first = false;
        offset += sliceH;
      }
    }

    assertActive();
    const blob = pdf.output("blob");
    assertActive();
    if (fileName) pdf.save(fileName);
    return blob;
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  try { return await Promise.race([render(), new Promise<Blob>((_resolve, reject) => { timer = setTimeout(() => { active = false; reject(new HtmlPrintError('TIMED_OUT')); }, 45000); })]); }
  finally { active = false; if (timer) clearTimeout(timer); frame.dispose(); }
}
