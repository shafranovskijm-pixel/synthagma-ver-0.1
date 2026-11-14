import type { PrivateArtifactStore } from './official-client.ts';
import { sha256 } from './official-client.ts';

export interface NpaStorage {
  from(bucket: string): {
    upload(path: string, bytes: Uint8Array, options: { contentType: string; upsert: false }): PromiseLike<{ error: { statusCode?: string | number; message?: string } | null }>;
    download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>;
  };
}
const mimeTypes = new Set(['application/json', 'text/html', 'text/plain', 'text/xml', 'application/xml', 'application/pdf', 'application/octet-stream']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Bind every immutable public-source artifact to the server-owned run. */
export function createPrivateArtifactStore(storage: NpaStorage, runId: string): PrivateArtifactStore {
  if (!uuid.test(runId)) throw new Error('RTN_NPA_INVALID_SERVER_RUN');
  const prefix = `npa250/${runId}/`;
  return {
    async put(input) {
      const { bucket: bucketName, path, contentType } = input;
      if (bucketName !== 'rtn-sources' || !path.startsWith(prefix) ||
          !/^[a-f0-9]{64}\.(json|html|pdf|xml|bin)$/.test(path.slice(prefix.length)) ||
          !(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > (path.endsWith('.pdf') ? 16 : 15) * 1024 * 1024) throw new Error('RTN_NPA_INVALID_ARTIFACT');
      // Capture every mutable caller value BEFORE digest yields to another task.
      const bytes = Uint8Array.from(input.bytes);
      const mime = contentType.split(';')[0].trim().toLowerCase();
      if (!mimeTypes.has(mime)) throw new Error('RTN_NPA_INVALID_ARTIFACT_TYPE');
      const expected = path.slice(prefix.length, prefix.length + 64);
      if (await sha256(bytes) !== expected) throw new Error('RTN_NPA_ARTIFACT_HASH_MISMATCH');
      const bucket = storage.from('rtn-sources');
      const result = await bucket.upload(path, bytes, { contentType: mime, upsert: false });
      if (!result.error) return;
      if (!['400', '409'].includes(String(result.error.statusCode)) || !/already exists|duplicate/i.test(result.error.message || '')) throw new Error('RTN_NPA_ARTIFACT_STORAGE_UNAVAILABLE');
      const existing = await bucket.download(path);
      if (existing.error || !existing.data || existing.data.size !== bytes.byteLength ||
          await sha256(new Uint8Array(await existing.data.arrayBuffer())) !== expected) throw new Error('RTN_NPA_ARTIFACT_EXISTING_BYTES_CONFLICT');
      // Never overwrite an original, including after a crashed/retried lease.
    },
  };
}
