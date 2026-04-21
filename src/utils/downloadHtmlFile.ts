/**
 * Downloads HTML content as a PDF file. Fetches HTML from a signed URL,
 * renders it via html2canvas, and converts to PDF via jsPDF.
 *
 * jsPDF and html2canvas are loaded dynamically to keep them out of the
 * main bundle — they total ~1 MB and are only used on download click.
 */
export async function downloadHtmlFile(url: string, fileName: string) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const res = await fetch(url);
  const html = await res.text();

  const container = document.createElement("div");
  container.style.width = "794px";
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.background = "white";

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const styles = doc.querySelectorAll("style");
  styles.forEach((s) => {
    const style = document.createElement("style");
    style.textContent = s.textContent;
    container.appendChild(style);
  });

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
