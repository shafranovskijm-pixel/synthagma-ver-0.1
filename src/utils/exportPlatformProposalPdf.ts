import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Generate a multi-page A4 PDF from sections marked with [data-proposal-section].
 * Each section becomes its own page.
 */
export async function exportPlatformProposalPdf(rootSelector = "#platform-proposal-root"): Promise<void> {
  const root = document.querySelector<HTMLElement>(rootSelector);
  if (!root) throw new Error("Proposal root not found");

  const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-proposal-section]"));
  if (sections.length === 0) throw new Error("No proposal sections to export");

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const contentWidth = pageWidth - margin * 2;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    const canvas = await html2canvas(section, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 1100,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const ratio = canvas.height / canvas.width;
    let imgWidth = contentWidth;
    let imgHeight = contentWidth * ratio;

    // If a section is taller than one A4 page, downscale it to fit.
    const maxHeight = pageHeight - margin * 2;
    if (imgHeight > maxHeight) {
      imgHeight = maxHeight;
      imgWidth = maxHeight / ratio;
    }

    if (i > 0) pdf.addPage();
    const x = (pageWidth - imgWidth) / 2;
    const y = margin;
    pdf.addImage(imgData, "JPEG", x, y, imgWidth, imgHeight, undefined, "FAST");
  }

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  pdf.save(`Sintagma_Proposal_${dd}-${mm}-${yyyy}.pdf`);
}
