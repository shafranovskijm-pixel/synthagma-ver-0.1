import { copiesJournalKey } from '@/lib/journals/copiesJournalStorage';

export const COPY_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export type CopyImportSource = Readonly<{
  origin: 'browser' | 'file';
  name: string;
  raw: string;
  sha256: string;
}>;

export class CopySourceError extends Error {
  constructor(readonly code: 'ACCESS_DENIED' | 'SOURCE_CHANGED' | 'SOURCE_UNAVAILABLE' | 'TOO_LARGE' | 'INVALID_UTF8') {
    super(code);
    this.name = 'CopySourceError';
  }
}

const encoder = new TextEncoder();
const requireCurrent = (current: () => boolean) => {
  if (!current()) throw new CopySourceError('ACCESS_DENIED');
};

async function digest(raw: string, current: () => boolean) {
  requireCurrent(current);
  const bytes = encoder.encode(raw);
  // localStorage stores UTF-16 strings. Reject lone surrogates instead of replacing them during a UTF-8 backup/hash.
  if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== raw) throw new CopySourceError('INVALID_UTF8');
  if (bytes.length > COPY_IMPORT_MAX_BYTES) throw new CopySourceError('TOO_LARGE');
  const hash = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  requireCurrent(current);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Only callers with confirmed server organization-wide import rights may inspect this old unscoped key. */
export async function captureBrowserCopySource(organizationId: string, allowed: boolean, current: () => boolean): Promise<CopyImportSource | null> {
  requireCurrent(current);
  if (!allowed) throw new CopySourceError('ACCESS_DENIED');
  let raw: string | null;
  try { raw = localStorage.getItem(copiesJournalKey(organizationId)); }
  catch { throw new CopySourceError('SOURCE_UNAVAILABLE'); }
  if (raw === null) return null;
  const sha256 = await digest(raw, current);
  requireCurrent(current);
  try {
    if (localStorage.getItem(copiesJournalKey(organizationId)) !== raw) throw new CopySourceError('SOURCE_CHANGED');
  } catch (error) {
    if (error instanceof CopySourceError) throw error;
    throw new CopySourceError('SOURCE_UNAVAILABLE');
  }
  return Object.freeze({ origin: 'browser', name: copiesJournalKey(organizationId), raw, sha256 });
}

export async function captureCopyFileSource(file: File, current: () => boolean): Promise<CopyImportSource> {
  requireCurrent(current);
  if (file.size > COPY_IMPORT_MAX_BYTES) throw new CopySourceError('TOO_LARGE');
  const bytes = await file.arrayBuffer();
  requireCurrent(current);
  let raw: string;
  // Preserve an existing BOM and reject undecodable bytes rather than silently repairing the source.
  try { raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new CopySourceError('INVALID_UTF8'); }
  const sha256 = await digest(raw, current);
  requireCurrent(current);
  return Object.freeze({ origin: 'file', name: file.name, raw, sha256 });
}

/** Re-check the exact browser image immediately before applying the already previewed import. Never rewrite it. */
export function assertCopyImportSourceCurrent(source: CopyImportSource, organizationId: string, current: () => boolean) {
  requireCurrent(current);
  if (source.origin !== 'browser') return;
  try {
    if (source.name !== copiesJournalKey(organizationId) || localStorage.getItem(source.name) !== source.raw) throw new CopySourceError('SOURCE_CHANGED');
  } catch (error) {
    if (error instanceof CopySourceError) throw error;
    throw new CopySourceError('SOURCE_UNAVAILABLE');
  }
}

export function downloadCopySourceBackup(source: CopyImportSource, current: () => boolean) {
  requireCurrent(current);
  const url = URL.createObjectURL(new Blob([source.raw], { type: 'text/plain;charset=utf-8' }));
  let link: HTMLAnchorElement | null = null;
  let activated = false;
  try {
    requireCurrent(current);
    link = document.createElement('a');
    link.href = url;
    link.download = 'copies-source-' + source.sha256.slice(0, 12) + '.txt';
    document.body.appendChild(link);
    link.click();
    activated = true;
  } finally {
    link?.remove();
    if (activated) setTimeout(() => URL.revokeObjectURL(url), 1000);
    else URL.revokeObjectURL(url);
  }
}
