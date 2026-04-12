/**
 * TUS (resumable) upload utility for Supabase Storage.
 * Supabase supports TUS protocol at: {baseUrl}/storage/v1/upload/resumable
 *
 * This implements chunked upload with:
 * - 50 MB chunk size
 * - Auto-retry up to 3 times per chunk
 * - Progress reporting
 * - Stall detection (60s no progress)
 * - Abort support
 */

const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB
const STALL_TIMEOUT_MS = 90_000; // 90 seconds (increased for slow connections)
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
  let lastProgressTime = Date.now();

  const resetStallTimer = () => {
    lastProgressTime = Date.now();
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
          // Wait before retry: 2s, 4s
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
