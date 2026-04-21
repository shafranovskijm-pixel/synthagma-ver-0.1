import { PDFDocument } from "pdf-lib";

/**
 * Рендерит HTML договора через браузер (html2canvas) → нарезает на страницы A4
 * → добавляет в pdf-lib документ как PNG-страницы.
 *
 * Это даёт «как в счетах/актах»: реальная типографика, нумерация, отступы,
 * жирный шрифт, кириллица, поддержка `<ins>` зелёным.
 */
export async function appendHtmlAsRenderedPages(
  pdf: PDFDocument,
  html: string,
  documentTitle: string,
): Promise<void> {
  // A4 при 96dpi = 794 × 1123px
  const A4_W_PX = 794;
  const A4_H_PX = 1123;
  const PADDING_PX = 56;

  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    left: -10000px;
    top: 0;
    width: ${A4_W_PX}px;
    padding: ${PADDING_PX}px;
    background: #ffffff;
    color: #111;
    font-family: 'PT Sans', Arial, sans-serif;
    font-size: 14px;
    line-height: 1.55;
    box-sizing: border-box;
  `;

  // Премиальные стили под inline-теги, чтобы документ выглядел как счета/акты
  const styleBlock = `
    <style>
      .__pdf-doc h1 { font-size: 22px; font-weight: 700; color: #0f8c7e; margin: 0 0 16px; }
      .__pdf-doc h2 { font-size: 18px; font-weight: 700; color: #0f8c7e; margin: 18px 0 10px; }
      .__pdf-doc h3 { font-size: 15px; font-weight: 700; color: #111; margin: 14px 0 8px; }
      .__pdf-doc p { margin: 0 0 10px; text-align: justify; }
      .__pdf-doc ul, .__pdf-doc ol { margin: 0 0 12px; padding-left: 28px; }
      .__pdf-doc li { margin-bottom: 6px; }
      .__pdf-doc table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      .__pdf-doc th, .__pdf-doc td { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; vertical-align: top; }
      .__pdf-doc th { background: #f3f7f6; font-weight: 700; }
      .__pdf-doc ins { background: #dcfce7; color: #14532d; text-decoration: none; padding: 1px 3px; border-radius: 2px; }
      .__pdf-doc del, .__pdf-doc s { display: none; }
      .__pdf-doc strong, .__pdf-doc b { font-weight: 700; }
      .__pdf-doc em, .__pdf-doc i { font-style: italic; }
      .__pdf-doc blockquote { border-left: 3px solid #0f8c7e; padding-left: 12px; margin: 12px 0; color: #444; }
      .__pdf-doc .__pdf-title { font-size: 24px; font-weight: 700; color: #0f8c7e; margin: 0 0 6px; text-align: center; }
      .__pdf-doc .__pdf-divider { height: 2px; background: #0f8c7e; margin: 8px 0 22px; opacity: 0.7; }
      .__pdf-doc img { max-width: 100%; height: auto; }
    </style>
  `;

  container.innerHTML = `
    ${styleBlock}
    <div class="__pdf-doc">
      <div class="__pdf-title">${escapeHtml(documentTitle)}</div>
      <div class="__pdf-divider"></div>
      ${html}
    </div>
  `;

  document.body.appendChild(container);

  try {
    // Ждём отрисовки шрифтов
    if ((document as any).fonts?.ready) {
      try {
        await (document as any).fonts.ready;
      } catch {
        /* ignore */
      }
    }

    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: A4_W_PX,
    });

    // Нарезка по высоте страницы. canvas в 2× — пересчитываем.
    const scale = canvas.width / A4_W_PX; // ≈ 2
    const pageHeightPx = Math.floor(A4_H_PX * scale);
    const totalHeight = canvas.height;

    let offsetY = 0;
    while (offsetY < totalHeight) {
      const sliceHeight = Math.min(pageHeightPx, totalHeight - offsetY);

      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) break;
      // белый фон, чтобы PNG не был прозрачным
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0, offsetY, canvas.width, sliceHeight,
        0, 0, canvas.width, sliceHeight,
      );

      const dataUrl = sliceCanvas.toDataURL("image/png");
      const pngBytes = dataUrlToBytes(dataUrl);
      const png = await pdf.embedPng(pngBytes);

      // Создаём страницу A4 в точках (pdf-lib): 595.28 × 841.89
      const A4_PT = { w: 595.28, h: 841.89 };
      const page = pdf.addPage([A4_PT.w, A4_PT.h]);
      // Масштаб: ширину slice растягиваем на ширину страницы
      const drawW = A4_PT.w;
      const drawH = (sliceHeight / canvas.width) * A4_PT.w;
      page.drawImage(png, {
        x: 0,
        y: A4_PT.h - drawH,
        width: drawW,
        height: drawH,
      });

      offsetY += sliceHeight;
    }
  } finally {
    document.body.removeChild(container);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
