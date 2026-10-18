/** Resolve uploads and generated billing files without persisting expiring URLs. */
export function companyDocumentStorage(document: {
  company_id: string; file_path?: string | null; file_url?: string | null;
}): { bucket: string; path: string } | null {
  const reference = document.file_path || document.file_url;
  if (!reference) return null;
  if (/^https?:\/\//i.test(reference)) {
    try {
      const url = new URL(reference);
      const match = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/(company-documents|billing-documents)\//.exec(url.pathname);
      if (url.protocol === "https:" && match) return { bucket: match[1], path: reference };
    } catch { /* Unknown links remain external attachments. */ }
    return null;
  }
  return { bucket: reference.startsWith(`${document.company_id}/`) ? "company-documents" : "billing-documents", path: reference };
}
