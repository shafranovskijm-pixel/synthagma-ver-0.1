import { extractStoragePath, getSignedStorageUrl, type PrivateDownloadSigner } from "@/utils/storageHelpers";
import { sanitizeWorkflowHtml } from "@/lib/orgDocumentWorkflow";

export interface OrgDocumentReviewReadOptions { signUrl?: PrivateDownloadSigner; assertCurrent?: () => void }

/** Read-only display adapter: no signature RPC, cache write or file modification. */
export async function loadOrgDocumentReviewContent(locator: string, fileName: string, signal: AbortSignal, options: OrgDocumentReviewReadOptions = {}): Promise<string | null> {
  const path = extractStoragePath(locator, "org-documents");
  const ext = (fileName || path).split(".").pop()?.toLowerCase();
  if (!["html", "htm", "docx"].includes(ext ?? "")) return null;
  const assertCurrent = () => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    options.assertCurrent?.();
  };
  assertCurrent();
  const url = options.signUrl
    ? await options.signUrl({ bucket: "org-documents", path, expiresIn: 60, downloadName: fileName || path.split("/").pop() || "Документ", signal, deadline: Date.now() + 45000 })
    : await getSignedStorageUrl("org-documents", path, 60);
  assertCurrent();
  if (!url) throw new Error("Не удалось открыть файл текущей версии");
  const response = await fetch(url, { signal, cache: "no-store", credentials: "omit" });
  assertCurrent();
  if (!response.ok) throw new Error("Не удалось прочитать файл текущей версии");
  const blob = await response.blob();
  assertCurrent();
  if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error("Файл пуст или слишком велик для встроенного просмотра");
  let html: string;
  if (ext === "docx") {
    const bytes = await blob.arrayBuffer(), magic = new Uint8Array(bytes.slice(0, 4));
    assertCurrent();
    if (magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 3 || magic[3] !== 4) throw new Error("Не удалось прочитать DOCX. Откройте исходный файл.");
    const mammoth = await import("mammoth/mammoth.browser");
    assertCurrent();
    html = (await mammoth.convertToHtml({ arrayBuffer: bytes })).value;
  } else html = await blob.text();
  assertCurrent();
  return sanitizeWorkflowHtml(html);
}
