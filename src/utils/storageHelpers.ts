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
export const downloadPrivateFile = async (
  bucket: string,
  fileUrlOrPath: string,
  fileName?: string,
): Promise<boolean> => {
  const path = extractStoragePath(fileUrlOrPath, bucket);
  const fallbackName = path.split("/").pop() || "download";
  let downloadName = (fileName?.trim() || fallbackName).replace(/[\\/:*?"<>|]+/g, "_");
  const extension = /\.([a-z0-9]{1,10})$/i.exec(fallbackName)?.[1];
  if (extension && !/\.[a-z0-9]{1,10}$/i.test(downloadName)) downloadName += `.${extension}`;

  try {
    const signedUrl = await getSignedStorageUrl(bucket, path, 3600, downloadName);
    if (!signedUrl) {
      console.error("Failed to generate download URL for:", path);
      return false;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let blob: Blob;
    try {
      const response = await fetch(signedUrl, { signal: controller.signal, cache: "no-store", credentials: "omit" });
      if (!response.ok) return false;
      const mime = (response.headers.get("content-type") || "").toLowerCase();
      if (mime.includes("text/html") && !/\.(html?|xhtml|doc)$/i.test(fallbackName)
        || mime.includes("application/json") && !/\.json$/i.test(fallbackName)) return false;
      blob = await response.blob();
      if (!blob.size) return false;
    } finally { clearTimeout(timeout); }
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    try {
      link.href = blobUrl;
      link.download = downloadName;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
    return true;
  } catch (error) {
    console.error("Failed to download private file:", path, error);
    return false;
  }
};
