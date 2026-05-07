import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Generate a compact A4 PDF (typically 1–2 pages) by rendering the entire
 * proposal root once and slicing the resulting canvas into A4-sized pages.
 *
 * Подпись и печать ИП Шафрановский М.М. находятся в последней секции
 * `[data-proposal-section]` и автоматически попадают на последнюю страницу.
 */
export async function exportPlatformProposalPdf(rootSelector = "#platform-proposal-root"): Promise<void> {
  const root = document.querySelector<HTMLElement>(rootSelector);
  if (!root) throw new Error("Proposal root not found");

  // Временно уплотняем верстку, чтобы PDF получился в 1–2 листа.
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    #platform-proposal-root .proposal-print-hide { display: none !important; }
    #platform-proposal-root [data-proposal-section] { margin-bottom: 16px !important; padding: 16px !important; box-shadow: none !important; }
    #platform-proposal-root h1 { font-size: 22px !important; line-height: 1.2 !important; }
    #platform-proposal-root h2 { font-size: 16px !important; line-height: 1.2 !important; margin-bottom: 6px !important; }
    #platform-proposal-root h3 { font-size: 14px !important; }
    #platform-proposal-root p, #platform-proposal-root li, #platform-proposal-root td, #platform-proposal-root th { font-size: 11px !important; line-height: 1.35 !important; }
    #platform-proposal-root section { break-inside: auto !important; page-break-before: auto !important; page-break-inside: auto !important; }
  `;
  document.head.appendChild(styleEl);

  try {
    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 1100,
      logging: false,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;

    const pxPerMm = canvas.width / contentWidth;
    const pageHeightPx = Math.floor(contentHeight * pxPerMm);

    let renderedPx = 0;
    let pageIdx = 0;
    while (renderedPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);

      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0, renderedPx, canvas.width, sliceHeightPx,
        0, 0, canvas.width, sliceHeightPx,
      );

      const imgData = sliceCanvas.toDataURL("image/jpeg", 0.9);
      const imgHeightMm = sliceHeightPx / pxPerMm;

      if (pageIdx > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", margin, margin, contentWidth, imgHeightMm, undefined, "FAST");

      renderedPx += sliceHeightPx;
      pageIdx += 1;
    }

    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = today.getFullYear();
    pdf.save(`Sintagma_Proposal_${dd}-${mm}-${yyyy}.pdf`);
  } finally {
    styleEl.remove();
  }
}
