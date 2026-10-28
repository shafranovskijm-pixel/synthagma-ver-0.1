// The official deep .d.mts re-exports "pdfjs-dist" by package name. With
// the isolated alias and preserved3.11 package that would bind old types.
// Bind only this exact6.4 compatibility module to the exact6.4 root API.
declare module "pdfjs-dist-sealed/legacy/build/pdf.mjs" {
  export { AnnotationMode,PDFWorker,VerbosityLevel,getDocument } from "pdfjs-dist-sealed";
}
