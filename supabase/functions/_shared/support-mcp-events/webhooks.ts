import { base64Encode, constantTimeTextEqual, hashSecret, sha256Hex, validateWebhookSecret } from './crypto.ts';
import { CallbackTransportError, canonicalizeCallback, type PinnedHttpsTransport } from './pinned-https.ts';

const encoder = new TextEncoder();
export const EVENT_BODY_LIMIT = 262144;
export const VERIFICATION_RESPONSE_LIMIT = 4096;
export const ROTATION_WINDOW_MS = 120_000;
export type CallbackFailureReason = 'invalid_callback' | 'destination_not_public' | 'challenge_failed' | 'timeout' | 'dns_failed' | 'network_error' | 'tls_failed' | 'redirect_blocked' | 'runtime_not_proven' | 'pinning_failed';
export class CallbackEndpointError extends Error {
  readonly reason: CallbackFailureReason;
  constructor(reason: CallbackFailureReason) { super(reason); this.name = 'CallbackEndpointError'; this.reason = reason; }
}
export type SigningInput = {
  eventId: string; subscriptionId: string; body: Uint8Array; secret: string; signedAt: number;
  previousSecret?: string | null; previousValidUntil?: string | null;
};
function headerId(value: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_:-]{1,256}$/.test(value)) throw new CallbackEndpointError('challenge_failed');
}
export async function signWebhook(input: SigningInput, cryptoApi: Crypto = globalThis.crypto): Promise<Record<string, string>> {
  headerId(input.eventId); headerId(input.subscriptionId);
  if (!Number.isSafeInteger(input.signedAt) || input.signedAt < 0 || input.body.byteLength > EVENT_BODY_LIMIT) throw new CallbackEndpointError('challenge_failed');
  const seconds = String(Math.floor(input.signedAt / 1000));
  const prefix = encoder.encode(`${input.eventId}.${seconds}.`);
  const signedBytes = new Uint8Array(prefix.length + input.body.byteLength); signedBytes.set(prefix); signedBytes.set(input.body, prefix.length);
  async function mac(secret: string) {
    const bytes = validateWebhookSecret(secret);
    const key = await cryptoApi.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    bytes.fill(0);
    return `v1,${base64Encode(new Uint8Array(await cryptoApi.subtle.sign('HMAC', key, signedBytes)))}`;
  }
  const signatures = [await mac(input.secret)];
  const until = input.previousValidUntil ? Date.parse(input.previousValidUntil) : NaN;
  if (input.previousSecret && Number.isFinite(until) && until > input.signedAt && until - input.signedAt <= ROTATION_WINDOW_MS) {
    if (input.previousSecret !== input.secret) signatures.push(await mac(input.previousSecret));
  }
  return {
    'Content-Type': 'application/json', 'webhook-id': input.eventId, 'webhook-timestamp': seconds,
    'webhook-signature': signatures.join(' '), 'X-MCP-Subscription-Id': input.subscriptionId,
  };
}
export type VerifyCallbackInput = { url: string; secret: string; subscriptionId: string; principalKey: string };
export type CallbackVerifierOptions = {
  transport: PinnedHttpsTransport; crypto?: Crypto; now?: () => number; cacheTtlMs?: number; maxCacheEntries?: number;
};
/** Successful cache entries contain only a hash and bounded expiration. */
export function createCallbackVerifier(options: CallbackVerifierOptions): (input: VerifyCallbackInput) => Promise<void> {
  const cryptoApi = options.crypto ?? globalThis.crypto;
  const now = options.now ?? Date.now;
  const ttl = Math.min(300_000, Math.max(0, options.cacheTtlMs ?? 300_000));
  const maxEntries = Math.min(4096, Math.max(1, options.maxCacheEntries ?? 512));
  if (!Number.isFinite(ttl) || !Number.isSafeInteger(maxEntries)) throw new CallbackEndpointError('challenge_failed');
  const cache = new Map<string, number>();
  return async function verifyCallback(input) {
    try {
      const url = canonicalizeCallback(input.url); validateWebhookSecret(input.secret); headerId(input.subscriptionId);
      if (typeof input.principalKey !== 'string' || !input.principalKey || input.principalKey.length > 1024) throw new CallbackEndpointError('challenge_failed');
      const secretHash = await hashSecret(input.secret, cryptoApi);
      const key = await sha256Hex(encoder.encode(JSON.stringify([input.principalKey, url, secretHash])), cryptoApi);
      const started = now();
      for (const [k, until] of cache) if (until <= started) cache.delete(k);
      if ((cache.get(key) ?? 0) > started) return;
      options.transport.assertReady();
      const challenge = base64Encode(cryptoApi.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const id = `msg_verification_${base64Encode(cryptoApi.getRandomValues(new Uint8Array(24))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
      const body = encoder.encode(JSON.stringify({ type: 'verification', challenge }));
      const headers = await signWebhook({ eventId: id, subscriptionId: input.subscriptionId, body, secret: input.secret, signedAt: started }, cryptoApi);
      // This challenge belongs to this invocation only and is never reused or retried.
      const result = await options.transport.post({ url, body, headers, responseLimitBytes: VERIFICATION_RESPONSE_LIMIT });
      if (now() - started >= 10_000) throw new CallbackEndpointError('timeout');
      if (result.status < 200 || result.status >= 300 || result.body.byteLength > VERIFICATION_RESPONSE_LIMIT) throw new CallbackEndpointError('challenge_failed');
      let echoed: unknown;
      try { echoed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.body)); }
      catch { throw new CallbackEndpointError('challenge_failed'); }
      if (!echoed || typeof echoed !== 'object' || Array.isArray(echoed) ||
          typeof (echoed as { challenge?: unknown }).challenge !== 'string' ||
          !(await constantTimeTextEqual(challenge, (echoed as { challenge: string }).challenge, cryptoApi))) throw new CallbackEndpointError('challenge_failed');
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
      if (ttl > 0) cache.set(key, now() + ttl);
    } catch (error) {
      if (error instanceof CallbackEndpointError) throw error;
      if (error instanceof CallbackTransportError) {
        const reason = error.reason === 'response_too_large' || error.reason === 'payload_too_large' ? 'challenge_failed' : error.reason;
        throw new CallbackEndpointError(reason);
      }
      throw new CallbackEndpointError('challenge_failed');
    }
  };
}
