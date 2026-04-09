import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/**
 * Downloads HTML content as a PDF file. Fetches HTML from a signed URL,
 * renders it via html2canvas, and converts to PDF via jsPDF.
 */
export async function downloadHtmlFile(url: string, fileName: string) {
  const res = await fetch(url);
  const html = await res.text();

  // Create off-screen container with A4 width
  const container = document.createElement("div");
  container.style.width = "794px";
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.background = "white";

  // Parse HTML and inject styles + body content
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Copy style tags
  const styles = doc.querySelectorAll("style");
  styles.forEach((s) => {
    const style = document.createElement("style");
    style.textContent = s.textContent;
    container.appendChild(style);
  });

  // Copy body content
  container.innerHTML += doc.body.innerHTML;
  document.body.appendChild(container);

  const canvas = await html2canvas(container, { scale: 2, useCORS: true, windowWidth: 794 });
  document.body.removeChild(container);

  const pdf = new jsPDF("p", "mm", "a4");
  const imgWidth = 190;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const pageHeight = 277;

  let position = 10;
  let heightLeft = imgHeight;

  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + 10;
    pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  const safeName = fileName.replace(/\.html$/i, "").replace(/\.pdf$/i, "") + ".pdf";
  pdf.save(safeName);
}
