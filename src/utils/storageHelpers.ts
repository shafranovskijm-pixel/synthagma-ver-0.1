import { supabase } from "@/integrations/supabase/client";
import { proxiedAssetUrl } from "@/utils/proxyFetch";

/**
 * Get a signed URL for a file in a private storage bucket.
 * Returns a time-limited URL (1 hour) for secure access.
 */
export const getSignedStorageUrl = async (
  bucket: string,
  path: string,
  expiresIn = 3600,
  downloadName?: string,
): Promise<string | null> => {
  const storage = supabase.storage.from(bucket);
  const { data, error } = downloadName
    ? await storage.createSignedUrl(path, expiresIn, { download: downloadName })
    : await storage.createSignedUrl(path, expiresIn);

  if (error) {
    console.error("Error creating signed URL:", error);
    return null;
  }

  return proxiedAssetUrl(data.signedUrl);
};

/**
 * Extract the storage path from a public URL or return the path as-is.
 * Handles both old public URLs and new path-based storage references.
 */
export const extractStoragePath = (
  fileUrlOrPath: string,
  bucket: string
): string => {
  // If it's already a path (no http), return as-is
  if (!fileUrlOrPath.startsWith("http")) {
    return fileUrlOrPath;
  }
  // Old public locators and temporary signed URLs both identify the same
  // object. Do not pass a query token/hash or URL-encoded name to Storage.
  let pathname: string;
  try { pathname = new URL(fileUrlOrPath).pathname; }
  catch { return fileUrlOrPath; }
  const marker = `/${bucket}/`;
  const idx = pathname.indexOf(marker);
  if (idx !== -1) {
    const encodedPath = pathname.substring(idx + marker.length);
    try { return decodeURIComponent(encodedPath); }
    catch { return encodedPath; }
  }
  return fileUrlOrPath;
};

/**
 * Open a file from a private bucket in a new tab using a signed URL.
 */
export const openPrivateFile = async (
  bucket: string,
  fileUrlOrPath: string
): Promise<boolean> => {
  const path = extractStoragePath(fileUrlOrPath, bucket);
  // Open while the click is still a direct user gesture. Waiting for the
  // signing request first makes browsers treat window.open as a popup.
  const target = window.open("about:blank", "_blank");
  if (!target) {
    console.error("Browser blocked opening private file:", path);
    return false;
  }
  target.opener = null;

  try {
    const signedUrl = await getSignedStorageUrl(bucket, path);
    if (!signedUrl) {
      target.close();
      console.error("Failed to generate signed URL for:", path);
      return false;
    }
    target.location.replace(signedUrl);
    return true;
  } catch (error) {
    target.close();
    console.error("Failed to open private file:", path, error);
    return false;
  }
};

/** Retrieve private bytes before asking the browser to save them.
 * A cross-origin anchor cannot reliably apply the requested download name;
 * a successful signing response alone does not prove the file was retrieved.
 */
export type PrivateDownloadProgress = "preparing" | "downloading" | "handed_to_browser" | "failed" | "timed_out" | "cancelled";
export interface PrivateDownloadSigningInput {
  bucket: string; path: string; expiresIn: number; downloadName: string; signal: AbortSignal; deadline: number;
}
export type PrivateDownloadSigner = (input: PrivateDownloadSigningInput) => Promise<string | null>;
export interface PrivateDownloadOptions {
  onProgress?: (progress: PrivateDownloadProgress) => void;
  /** Optional current actor/context guard for scoped callers. No new access is granted. */
  assertCurrent?: () => void;
  /** Optional original-actor signing transport. Legacy callers retain the standard SDK. */
  signUrl?: PrivateDownloadSigner;
  signal?: AbortSignal;
}
const PRIVATE_DOWNLOAD_DEADLINE_MS = 45000;
export const downloadPrivateFile = async (
  bucket: string,
  fileUrlOrPath: string,
  fileName?: string,
  options: PrivateDownloadOptions = {},
): Promise<boolean> => {
  const path = extractStoragePath(fileUrlOrPath, bucket);
  const fallbackName = path.split("/").pop() || "download";
  let downloadName = (fileName?.trim() || fallbackName).replace(/[\\/:*?"<>|]+/g, "_");
  const extension = /\.([a-z0-9]{1,10})$/i.exec(fallbackName)?.[1];
  if (extension && !/\.[a-z0-9]{1,10}$/i.test(downloadName)) downloadName += `.${extension}`;

  const controller = new AbortController();
  const deadline = Date.now() + PRIVATE_DOWNLOAD_DEADLINE_MS;
  let timedOut = false;
  const report = (progress: PrivateDownloadProgress) => {
    // A status renderer must not interrupt the file operation.
    try { options.onProgress?.(progress); } catch { /* no file data in diagnostics */ }
  };
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, PRIVATE_DOWNLOAD_DEADLINE_MS);
  const ensureActive = () => {
    options.assertCurrent?.();
    if (!controller.signal.aborted && Date.now() >= deadline) { timedOut = true; controller.abort(); }
    if (controller.signal.aborted) throw new DOMException("Download stopped", "AbortError");
  };
  // Signing has no SDK abort parameter. Race every awaited phase against the
  // same deadline, retaining handlers on late responses without using them.
  const waitFor = <T,>(pending: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const aborted = () => reject(new DOMException("Download stopped", "AbortError"));
    controller.signal.addEventListener("abort", aborted, { once: true });
    if (controller.signal.aborted) aborted();
    pending.then(value => {
      controller.signal.removeEventListener("abort", aborted);
      try { ensureActive(); resolve(value); } catch (error) { reject(error); }
    }, error => {
      controller.signal.removeEventListener("abort", aborted);
      reject(error);
    });
  });
  try {
    ensureActive(); report("preparing");
    const signedUrl = await waitFor(options.signUrl
      ? options.signUrl({ bucket, path, expiresIn: 3600, downloadName, signal: controller.signal, deadline })
      : getSignedStorageUrl(bucket, path, 3600, downloadName));
    ensureActive();
    if (!signedUrl) { report("failed"); return false; }
    report("downloading");
    const response = await waitFor(fetch(signedUrl, { signal: controller.signal, cache: "no-store", credentials: "omit" }));
    ensureActive();
    if (!response.ok) { report("failed"); return false; }
    const mime = (response.headers.get("content-type") || "").toLowerCase();
    if (mime.includes("text/html") && !/\.(html?|xhtml|doc)$/i.test(fallbackName)
      || mime.includes("application/json") && !/\.json$/i.test(fallbackName)) { report("failed"); return false; }
    const blob = await waitFor(response.blob());
    ensureActive();
    if (!blob.size) { report("failed"); return false; }
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    try {
      link.href = blobUrl;
      link.download = downloadName;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      ensureActive();
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
    report("handed_to_browser");
    return true;
  } catch {
    report(timedOut ? "timed_out" : controller.signal.aborted ? "cancelled" : "failed");
    return false;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
  }
};
