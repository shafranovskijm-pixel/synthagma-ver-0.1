/** Server-only key handling. No OAuth/JWT key is used for stored webhook secrets. */
import { timingSafeEqual } from 'node:crypto';
import { ownedArrayBuffer } from './crypto-buffer.ts';

export type SecretEnvelope = { v: 1; kid: string; iv: string; ciphertext: string };
export type SecretBinding = {
  owner_user_id: string; oauth_client_id: string; event_name: string; callback_url: string;
};
export type CryptoErrorCode = 'invalid_secret' | 'invalid_encryption_key' | 'invalid_envelope' | 'decryption_failed' | 'invalid_aad';
export class SecretCryptoError extends Error {
  readonly code: CryptoErrorCode;
  constructor(code: CryptoErrorCode) { super(code); this.name = 'SecretCryptoError'; this.code = code; }
}
const encoder = new TextEncoder();
export function base64Encode(bytes: Uint8Array): string {
  let text = ''; for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
export function strictBase64(value: unknown, min: number, max: number, code: CryptoErrorCode): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(max / 3) * 4 ||
      value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new SecretCryptoError(code);
  }
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0)); }
  catch { throw new SecretCryptoError(code); }
  if (bytes.length < min || bytes.length > max || base64Encode(bytes) !== value) throw new SecretCryptoError(code);
  return bytes;
}
export function validateWebhookSecret(secret: unknown): Uint8Array {
  if (typeof secret !== 'string' || !secret.startsWith('whsec_')) throw new SecretCryptoError('invalid_secret');
  return strictBase64(secret.slice(6), 24, 64, 'invalid_secret');
}
export async function sha256Hex(bytes: Uint8Array, cryptoApi: Crypto = globalThis.crypto): Promise<string> {
  const input = ownedArrayBuffer(bytes);
  let digest: ArrayBuffer;
  try { digest = await cryptoApi.subtle.digest('SHA-256', input); }
  finally { new Uint8Array(input).fill(0); }
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function hashSecret(secret: string, cryptoApi: Crypto = globalThis.crypto): Promise<string> {
  const bytes = validateWebhookSecret(secret);
  try { return await sha256Hex(bytes, cryptoApi); }
  finally { bytes.fill(0); }
}
export function secretAad(binding: SecretBinding): string {
  const fields = [binding.owner_user_id, binding.oauth_client_id, binding.event_name, binding.callback_url];
  if (fields.some((v) => typeof v !== 'string' || v.length === 0 || v.length > 4096)) throw new SecretCryptoError('invalid_aad');
  return JSON.stringify(['sintagma-support-events-v1', ...fields]);
}
function aadBytes(aad: string): Uint8Array {
  if (typeof aad !== 'string' || aad.length === 0 || aad.length > 16384) throw new SecretCryptoError('invalid_aad');
  return encoder.encode(aad);
}
export type SecretCrypto = {
  readonly kid: string;
  encryptSecret(secret: string, aad: string): Promise<SecretEnvelope>;
  decryptSecret(envelope: SecretEnvelope, aad: string): Promise<string>;
  hashSecret(secret: string): Promise<string>;
};
export async function createSecretCrypto(base64Key: string, cryptoApi: Crypto = globalThis.crypto): Promise<SecretCrypto> {
  const keyBytes = strictBase64(base64Key, 32, 32, 'invalid_encryption_key');
  let kid: string;
  let rawKey: ArrayBuffer | undefined;
  let key: CryptoKey;
  try {
    kid = `mcp_${(await sha256Hex(keyBytes, cryptoApi)).slice(0, 32)}`;
    rawKey = ownedArrayBuffer(keyBytes);
    key = await cryptoApi.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } finally { keyBytes.fill(0); if (rawKey) new Uint8Array(rawKey).fill(0); }
  return {
    kid,
    hashSecret: (secret) => hashSecret(secret, cryptoApi),
    async encryptSecret(secret, aad) {
      validateWebhookSecret(secret);
      const iv = cryptoApi.getRandomValues(new Uint8Array(12));
      const ciphertext = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv: ownedArrayBuffer(iv), additionalData: ownedArrayBuffer(aadBytes(aad)), tagLength: 128 }, key, ownedArrayBuffer(encoder.encode(secret)));
      return { v: 1, kid, iv: base64Encode(iv), ciphertext: base64Encode(new Uint8Array(ciphertext)) };
    },
    async decryptSecret(envelope, aad) {
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || envelope.v !== 1 || envelope.kid !== kid ||
          Object.keys(envelope).sort().join(',') !== 'ciphertext,iv,kid,v') throw new SecretCryptoError('invalid_envelope');
      const iv = strictBase64(envelope.iv, 12, 12, 'invalid_envelope');
      const ciphertext = strictBase64(envelope.ciphertext, 40, 256, 'invalid_envelope');
      let bytes: ArrayBuffer;
      try { bytes = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: ownedArrayBuffer(iv), additionalData: ownedArrayBuffer(aadBytes(aad)), tagLength: 128 }, key, ownedArrayBuffer(ciphertext)); }
      catch { throw new SecretCryptoError('decryption_failed'); }
      let secret: string;
      try { secret = new TextDecoder('utf-8', { fatal: true }).decode(bytes); validateWebhookSecret(secret); }
      catch { throw new SecretCryptoError('decryption_failed'); }
      return secret;
    },
  };
}
/** Hash equal-size digests first, then use the native constant-time primitive. */
export async function constantTimeTextEqual(expected: string, received: string, cryptoApi: Crypto = globalThis.crypto): Promise<boolean> {
  const a = encoder.encode(expected), b = encoder.encode(received);
  const [da, db] = await Promise.all([cryptoApi.subtle.digest('SHA-256', a), cryptoApi.subtle.digest('SHA-256', b)]);
  const equal = timingSafeEqual(new Uint8Array(da), new Uint8Array(db));
  return (Number(equal) & Number(a.length === b.length)) === 1;
}
