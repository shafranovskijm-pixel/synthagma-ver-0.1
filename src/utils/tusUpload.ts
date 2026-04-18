/**
 * TUS (resumable) upload utility for Supabase Storage.
 * Supabase supports TUS protocol at: {baseUrl}/storage/v1/upload/resumable
 *
 * Features:
 * - 50 MB chunk size
 * - Auto-retry up to 5 times per chunk with exponential backoff
 * - **Resume on 409/410 mismatch offset**: server is queried via HEAD to learn
 *   its true offset, then uploading continues from there.
 * - Progress reporting
 * - Stall detection (90s no progress)
 * - Abort support
 */

const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB
const STALL_TIMEOUT_MS = 90_000; // 90 seconds
const MAX_RETRIES = 5;

export interface TusUploadOptions {
  file: File | Blob;
  bucket: string;
  path: string;
  baseUrl: string;
  apiKey: string;
  authToken: string;
  onProgress?: (percent: number) => void;
  onStall?: () => void;
  signal?: AbortSignal;
}

export interface TusUploadResult {
  url: string;
  storage: 'external' | 'internal';
}

/**
 * Read the server's current Upload-Offset for a TUS upload URL.
 * Returns null on failure.
 */
async function fetchServerOffset(
  uploadUrl: string,
  authToken: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const headRes = await fetch(uploadUrl, {
      method: 'HEAD',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': apiKey,
        'Tus-Resumable': '1.0.0',
      },
      signal,
    });
    if (!headRes.ok) return null;
    const off = headRes.headers.get('Upload-Offset');
    if (!off) return null;
    const parsed = parseInt(off, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function tusUpload(options: TusUploadOptions): Promise<TusUploadResult> {
  const { file, bucket, path, baseUrl, apiKey, authToken, onProgress, onStall, signal } = options;
  const endpoint = `${baseUrl}/storage/v1/upload/resumable`;
  const fileSize = file.size;
  const objectName = `${bucket}/${path}`;

  // 1. Create upload
  const createRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'apikey': apiKey,
      'Upload-Length': String(fileSize),
      'Upload-Metadata': `bucketName ${btoa(bucket)},objectName ${btoa(path)},contentType ${btoa((file as File).type || 'video/mp4')}`,
      'Tus-Resumable': '1.0.0',
      'x-upsert': 'true',
    },
    signal,
  });

  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    throw new Error(`TUS create failed (${createRes.status}): ${body}`);
  }

  const uploadUrl = createRes.headers.get('Location');
  if (!uploadUrl) throw new Error('TUS: no Location header returned');

  // 2. Upload chunks
  let offset = 0;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  const resetStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      onStall?.();
    }, STALL_TIMEOUT_MS);
  };

  try {
    while (offset < fileSize) {
      if (signal?.aborted) throw new Error('Upload cancelled');

      const end = Math.min(offset + CHUNK_SIZE, fileSize);
      const chunk = file.slice(offset, end);
      let retries = 0;
      let success = false;

      while (retries < MAX_RETRIES && !success) {
        try {
          resetStallTimer();

          const patchRes = await fetch(uploadUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'apikey': apiKey,
              'Upload-Offset': String(offset),
              'Content-Type': 'application/offset+octet-stream',
              'Tus-Resumable': '1.0.0',
            },
            body: chunk,
            signal,
          });

          // 409 = mismatch offset, 410 = upload gone (but might just be re-sync needed)
          // → re-sync with server's actual offset and continue without counting as retry
          if (patchRes.status === 409 || patchRes.status === 410) {
            const serverOffset = await fetchServerOffset(uploadUrl, authToken, apiKey, signal);
            if (serverOffset !== null && serverOffset > offset && serverOffset <= fileSize) {
              console.warn(`[TUS] resync ${offset} → ${serverOffset} (status ${patchRes.status})`);
              offset = serverOffset;
              onProgress?.(Math.round((offset / fileSize) * 100));
              success = true; // chunk was already accepted by server
              break;
            }
            if (serverOffset !== null && serverOffset === offset) {
              // Server is at our offset: chunk truly rejected, count as retry
              const body = await patchRes.text().catch(() => '');
              throw new Error(`TUS PATCH ${patchRes.status} at offset ${offset}: ${body}`);
            }
            // Could not get server offset → fall through to error path
            const body = await patchRes.text().catch(() => '');
            throw new Error(`TUS PATCH ${patchRes.status} (resync failed): ${body}`);
          }

          if (!patchRes.ok) {
            const body = await patchRes.text().catch(() => '');
            throw new Error(`TUS PATCH failed (${patchRes.status}): ${body}`);
          }

          const newOffset = patchRes.headers.get('Upload-Offset');
          if (newOffset) {
            offset = parseInt(newOffset, 10);
          } else {
            offset = end;
          }

          success = true;
          onProgress?.(Math.round((offset / fileSize) * 100));
        } catch (err: any) {
          if (signal?.aborted) throw err;
          retries++;
          if (retries >= MAX_RETRIES) throw err;

          // Before retrying, try resync with server in case the previous PATCH
          // actually went through.
          const serverOffset = await fetchServerOffset(uploadUrl, authToken, apiKey, signal);
          if (serverOffset !== null && serverOffset > offset && serverOffset <= fileSize) {
            console.warn(`[TUS] retry resync ${offset} → ${serverOffset}`);
            offset = serverOffset;
            onProgress?.(Math.round((offset / fileSize) * 100));
            success = true;
            break;
          }

          // Wait before retry: 2s, 4s, 6s, 8s
          await new Promise(r => setTimeout(r, retries * 2000));
        }
      }
    }
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }

  const publicUrl = `${baseUrl}/storage/v1/object/public/${objectName}`;
  const isExternal = !baseUrl.includes(import.meta.env.VITE_SUPABASE_URL || '___none___');

  return {
    url: publicUrl,
    storage: isExternal ? 'external' : 'internal',
  };
}
