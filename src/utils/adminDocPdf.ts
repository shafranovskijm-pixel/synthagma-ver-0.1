import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Рендерит произвольный HTML-документ (полная страница с <html>/<body>)
 * во временный оффскрин-iframe, снимает html2canvas и нарезает на A4 листы.
 * Возвращает Blob PDF (или скачивает, если fileName задан).
 */
export async function renderHtmlToPdf(html: string, fileName?: string): Promise<Blob> {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-99999px";
  iframe.style.top = "0";
  iframe.style.width = "794px"; // A4 width @ 96dpi
  iframe.style.height = "1123px";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();

    // Дать шрифтам/изображениям загрузиться
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      if (doc.readyState === "complete") setTimeout(done, 300);
      else iframe.addEventListener("load", () => setTimeout(done, 300), { once: true });
    });

    const target = (doc.querySelector(".doc") as HTMLElement) || doc.body;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: target.scrollWidth,
    });

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
        const ctx = slice.getContext("2d")!;
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

    const blob = pdf.output("blob");
    if (fileName) pdf.save(fileName);
    return blob;
  } finally {
    document.body.removeChild(iframe);
  }
}
