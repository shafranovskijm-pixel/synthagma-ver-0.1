import { extractStoragePath, getSignedStorageUrl } from "@/utils/storageHelpers";
import { sanitizeWorkflowHtml } from "@/lib/orgDocumentWorkflow";

/** Read-only display adapter: no signature RPC, cache write or file modification. */
export async function loadOrgDocumentReviewContent(locator: string, fileName: string, signal: AbortSignal): Promise<string | null> {
  const path = extractStoragePath(locator, "org-documents");
  const ext = (fileName || path).split(".").pop()?.toLowerCase();
  if (!["html", "htm", "docx"].includes(ext ?? "")) return null;
  const url = await getSignedStorageUrl("org-documents", path, 60);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (!url) throw new Error("Не удалось открыть файл текущей версии");
  const response = await fetch(url, { signal, cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error("Не удалось прочитать файл текущей версии");
  const blob = await response.blob();
  if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error("Файл пуст или слишком велик для встроенного просмотра");
  let html: string;
  if (ext === "docx") {
    const bytes = await blob.arrayBuffer(), magic = new Uint8Array(bytes.slice(0, 4));
    if (magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 3 || magic[3] !== 4) throw new Error("Не удалось прочитать DOCX. Откройте исходный файл.");
    const mammoth = await import("mammoth/mammoth.browser");
    html = (await mammoth.convertToHtml({ arrayBuffer: bytes })).value;
  } else html = await blob.text();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return sanitizeWorkflowHtml(html);
}
