/**
 * Opens browser print dialog for HTML content, allowing user to save as PDF.
 * Injects @page CSS to remove browser headers/footers and set A4 size.
 */
export function printHtmlContent(html: string, title?: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  // Inject @page styles and title into the HTML
  const printStyles = `
    <style>
      @page {
        size: A4;
        margin: 15mm 20mm;
      }
      @media print {
        body {
          padding: 0 !important;
          margin: 0 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    </style>
  `;

  const titleTag = title ? `<title>${title}</title>` : "";

  // Insert styles and title into <head>
  let modifiedHtml = html;
  if (modifiedHtml.includes("</head>")) {
    modifiedHtml = modifiedHtml.replace("</head>", `${printStyles}${titleTag}</head>`);
  } else if (modifiedHtml.includes("<body")) {
    modifiedHtml = modifiedHtml.replace("<body", `<head>${printStyles}${titleTag}</head><body`);
  } else {
    modifiedHtml = `<html><head>${printStyles}${titleTag}</head><body>${modifiedHtml}</body></html>`;
  }

  doc.open();
  doc.write(modifiedHtml);
  doc.close();

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } catch (e) {
        console.error("Print failed:", e);
      }
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };
}
