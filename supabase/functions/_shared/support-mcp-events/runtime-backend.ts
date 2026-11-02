import { z } from 'zod';
import { createSecretCrypto, type SecretCrypto } from './crypto.ts';
import { createPinnedHttpsTransport, type PinnedHttpsTransport } from './pinned-https.ts';
import { createCallbackVerifier } from './webhooks.ts';
import { EventProtocolError, identitySchema, type ProtocolBackend } from './protocol.ts';
import { loadRuntimeConfig, type RuntimeConfig } from './worker-http.ts';

type RpcResult = { data: unknown; error: unknown };
export type EventRpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};
export type EventUserClient = EventRpcClient & {
  auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
};
type EnvGetter = (name: string) => string | undefined;
export type RuntimeBackendOptions = {
  serviceClient(): EventRpcClient;
  userClient(originalBearer: string): EventUserClient;
  env: EnvGetter;
  transport?: PinnedHttpsTransport;
  crypto?: Crypto;
  now?: () => number;
  loadConfig?: () => Promise<RuntimeConfig>;
};
const readinessSchema = z.object({ enabled: z.boolean(), configured: z.boolean(), workerUrl: z.string().nullable().optional() }).strict();
const allowedMutations = new Set([
  'sintagma_support_event_identity',
  'sintagma_support_event_subscribe_verified',
  'sintagma_support_event_unsubscribe',
]);
function isDenied(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42501');
}

/** Real caller validation is separate from service-only encrypted subscription storage. */
export function createRuntimeBackend(options: RuntimeBackendOptions): ProtocolBackend {
  const cryptoApi = options.crypto ?? globalThis.crypto;
  const transport = options.transport ?? createPinnedHttpsTransport();
  const verifier = createCallbackVerifier({ transport, crypto: cryptoApi, now: options.now });
  const configLoader = options.loadConfig ?? (() => loadRuntimeConfig(options.serviceClient(), options.env));

  async function callService(name: string, args: Record<string, unknown>): Promise<unknown> {
    let result: RpcResult;
    try { result = await options.serviceClient().rpc(name, args); }
    catch { throw new EventProtocolError('operation_failed'); }
    if (result.error) throw new EventProtocolError(isDenied(result.error) ? 'forbidden' : 'operation_failed');
    return result.data;
  }
  return {
    async isReady() {
      // assertReady is fail-closed until the real Edge DNS/TLS pinning pilot is accepted.
      // Configuration alone never declares a Cloud subscription or runtime compatibility.
      try {
        transport.assertReady();
        const status = readinessSchema.parse(await callService('sintagma_support_event_runtime_readiness', {}));
        return status.enabled && status.configured;
      } catch { return false; }
    },
    async authenticateOriginalBearer(originalBearer) {
      let client: EventUserClient;
      let user: { data: { user: { id: string } | null }; error: unknown };
      try {
        client = options.userClient(originalBearer);
        user = await client.auth.getUser(originalBearer);
      } catch { throw new EventProtocolError('unauthorized'); }
      if (user.error || !user.data.user || !z.string().uuid().safeParse(user.data.user.id).success) {
        throw new EventProtocolError('unauthorized');
      }
      let authorized: RpcResult;
      try { authorized = await client.rpc('sintagma_support_event_authorize', {}); }
      catch { throw new EventProtocolError('operation_failed'); }
      if (authorized.error) throw new EventProtocolError(isDenied(authorized.error) ? 'forbidden' : 'operation_failed');
      const parsed = identitySchema.safeParse(authorized.data);
      if (!parsed.success || parsed.data.user_id !== user.data.user.id) throw new EventProtocolError('forbidden');
      return parsed.data;
    },
    async serviceRpc(name, args) {
      if (!allowedMutations.has(name)) throw new EventProtocolError('operation_failed');
      return await callService(name, args);
    },
    async secretCrypto(): Promise<SecretCrypto> {
      // Read the current key for every refresh; do not cache a revoked/rotated Vault value.
      let config: RuntimeConfig;
      try { config = await configLoader(); }
      catch { throw new EventProtocolError('configuration_unavailable'); }
      if (!config.enabled) throw new EventProtocolError('configuration_unavailable');
      try { return await createSecretCrypto(config.encryptionKey.key_base64, cryptoApi); }
      catch { throw new EventProtocolError('configuration_unavailable'); }
    },
    verifyCallback: verifier,
  };
}
