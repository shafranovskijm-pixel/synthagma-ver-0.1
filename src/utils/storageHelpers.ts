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
  // Extract path from public URL format
  const marker = `/${bucket}/`;
  const idx = fileUrlOrPath.indexOf(marker);
  if (idx !== -1) {
    return fileUrlOrPath.substring(idx + marker.length);
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

/** Download a private file through a signed temporary URL. */
export const downloadPrivateFile = async (
  bucket: string,
  fileUrlOrPath: string,
  fileName?: string,
): Promise<boolean> => {
  const path = extractStoragePath(fileUrlOrPath, bucket);
  const fallbackName = path.split("/").pop() || "download";
  const downloadName = (fileName?.trim() || fallbackName).replace(/[\\/:*?"<>|]+/g, "_");

  try {
    const signedUrl = await getSignedStorageUrl(bucket, path, 3600, downloadName);
    if (!signedUrl) {
      console.error("Failed to generate download URL for:", path);
      return false;
    }
    const link = document.createElement("a");
    link.href = signedUrl;
    link.download = downloadName;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch (error) {
    console.error("Failed to download private file:", path, error);
    return false;
  }
};
