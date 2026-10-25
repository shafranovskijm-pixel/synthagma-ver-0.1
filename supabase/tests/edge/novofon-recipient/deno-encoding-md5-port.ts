import { createHash } from 'node:crypto';
// Offline equivalents only for the three Deno std encoding/MD5 module imports.
export function encodeHex(value: Uint8Array): string { return Buffer.from(value).toString('hex'); }
export function encodeBase64(value: Uint8Array): string { return Buffer.from(value).toString('base64'); }
export const crypto = { subtle: { async digest(algorithm: string, value: Uint8Array): Promise<ArrayBuffer> {
  if (algorithm !== 'MD5') throw new Error('UNDECLARED_OFFLINE_DIGEST');
  const result = createHash('md5').update(value).digest();
  return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
} } };
