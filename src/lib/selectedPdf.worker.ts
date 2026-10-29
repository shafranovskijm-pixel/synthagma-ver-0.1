// Local bundled PDF.js6.4 worker only; no document-resource network requests.
import "pdfjs-dist-sealed/legacy/build/pdf.worker.mjs";
globalThis.fetch=()=>Promise.reject(new Error("SELECTED_PDF_EXTERNAL_RESOURCE_DISABLED"));
