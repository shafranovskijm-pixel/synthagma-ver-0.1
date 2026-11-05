import { supabase } from '@/integrations/supabase/client';
import { buildSupportScreenshotReference, type SupportScreenshotMime } from './supportScreenshotReference';

export const maxSupportScreenshotBytes = 5 * 1024 * 1024;
export class SupportScreenshotError extends Error {
  constructor() { super('support_screenshot_unavailable'); }
}
export async function supportScreenshotBytes(file: File): Promise<{bytes: ArrayBuffer; mime: SupportScreenshotMime; sha256: string}> {
  if (!file.size || file.size > maxSupportScreenshotBytes) throw new SupportScreenshotError();
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) throw new SupportScreenshotError();
  const b = new Uint8Array(bytes);
  const png = [137,80,78,71,13,10,26,10].every((value, index) => b[index] === value);
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
  const webp = b.length >= 12 && [82,73,70,70].every((value, index) => b[index] === value)
    && [87,69,66,80].every((value, index) => b[index + 8] === value);
  const mime = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : null;
  if (!mime || (file.type && file.type !== mime)) throw new SupportScreenshotError();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2,'0')).join('');
  return { bytes, mime, sha256 };
}

/** Explicitly selected image only. Private, immutable key; no signed URL is persisted. */
export async function uploadVideoReportScreenshot(userId: string, requestId: string, file: File, isCurrent: () => boolean) {
  const {bytes, mime, sha256} = await supportScreenshotBytes(file);
  if (!isCurrent()) throw new SupportScreenshotError();
  const target = buildSupportScreenshotReference(userId, requestId, sha256, mime);
  const bucket = supabase.storage.from(target.bucket);
  const {error} = await bucket.upload(target.path, bytes, {contentType:mime,upsert:false});
  if (error) {
    const status = 'statusCode' in error ? String(error.statusCode) : '';
    const statusNumber = 'status' in error ? String(error.status) : '';
    if (status !== '409' && statusNumber !== '409') throw new SupportScreenshotError();
    // Recover a lost upload response without trusting or overwriting an existing object.
    const {data: existing, error: readError} = await bucket.download(target.path);
    if (readError || !existing || existing.size > maxSupportScreenshotBytes) throw new SupportScreenshotError();
    const existingHash = await crypto.subtle.digest('SHA-256', await existing.arrayBuffer());
    if (Array.from(new Uint8Array(existingHash), value => value.toString(16).padStart(2,'0')).join('') !== sha256) {
      throw new SupportScreenshotError();
    }
  }
  if (!isCurrent()) throw new SupportScreenshotError();
  return target.reference;
}
