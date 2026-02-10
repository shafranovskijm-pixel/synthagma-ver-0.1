import { supabase } from "@/integrations/supabase/client";

/**
 * Get a signed URL for a file in a private storage bucket.
 * Returns a time-limited URL (1 hour) for secure access.
 */
export const getSignedStorageUrl = async (
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error("Error creating signed URL:", error);
    return null;
  }

  return data.signedUrl;
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
): Promise<void> => {
  const path = extractStoragePath(fileUrlOrPath, bucket);
  const signedUrl = await getSignedStorageUrl(bucket, path);
  if (signedUrl) {
    window.open(signedUrl, "_blank");
  } else {
    console.error("Failed to generate signed URL for:", path);
  }
};
