import { buildPlatformContractDocumentHtml, buildPlatformContractPagesHtml, platformContractFileName, A4_W } from "./generateContractHtml";
import type { PlatformContractDraft } from "./types";

/**
 * Скачивание PDF проекта договора через тот же надёжный механизм, что и КП:
 * рендер каждой A4-страницы через html2canvas и сборка в jsPDF.
 * window.print оставлен как отдельная опция, а не единственный путь.
 */
export async function downloadPlatformContractPdf(draft: PlatformContractDraft): Promise<void> {
  const pages = buildPlatformContractPagesHtml(draft);

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${A4_W}px;background:#fff;z-index:-1;`;
  host.innerHTML = pages.map((p) => `<div data-contract-page-host>${p}</div>`).join("");
  document.body.appendChild(host);

  try {
    if ((document as any).fonts?.ready) {
      try {
        await (document as any).fonts.ready;
      } catch {
        /* ignore */
      }
    }

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();

    const nodes = Array.from(host.querySelectorAll<HTMLElement>("[data-contract-page-host]"));
    for (let i = 0; i < nodes.length; i++) {
      const canvas = await html2canvas(nodes[i], {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: A4_W,
        logging: false,
      });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "JPEG", 0, 0, pw, ph, undefined, "FAST");
    }

    pdf.save(platformContractFileName(draft));
  } finally {
    host.remove();
  }
}

/** Печать проекта договора в отдельном iframe (дополнительная опция). */
export function printPlatformContract(draft: PlatformContractDraft): void {
  const html = buildPlatformContractDocumentHtml(draft);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      /* ignore */
    }
    setTimeout(() => iframe.remove(), 1000);
  }, 400);
}
