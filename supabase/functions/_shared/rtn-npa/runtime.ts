import type { NpaCheckClaim, NpaCheckResult } from './contracts.ts';
import { runOfficialNpaCheck, type WorkerDependencies } from './worker.ts';
import { actualUrl, assertSuccess, calendarDate, identityUrl, LAW_116, parseIdentity, record } from './actual-pravo-116.ts';
import { ProofError } from './official-client.ts';
import { createNpaExecutor, type NpaServiceRpc } from './executor.ts';
import { createPrivateArtifactStore, type NpaStorage } from './artifact-store.ts';
import type { GenuineUserClient } from './http-handler.ts';
import { createBoundedFetch, createQuestionSourceVerifier } from './question-source-verifier.ts';

export const SUPABASE_JS_PIN = 'npm:@supabase/supabase-js@2.90.1';
export const WHOLE_WORKER_MS = 90_000;
export const PROJECT_HTTP_MS = 15_000;
export const COMPLETION_RPC_MS = 10_000;

type RpcReply = { data: unknown; error: { code?: string } | null };
type RpcOperation = PromiseLike<RpcReply> & { abortSignal?(signal: AbortSignal): PromiseLike<RpcReply> };
export interface NpaSupabaseClient {
  auth: GenuineUserClient['auth'];
  rpc(name: string, args?: Record<string, unknown>): RpcOperation;
  storage: NpaStorage;
}
export interface NpaClientOptions {
  auth: { persistSession: false; autoRefreshToken: false; detectSessionInUrl: false };
  global: { fetch: typeof fetch; headers?: { Authorization: string } };
}
export type NpaCreateClient = (url: string, key: string, options: NpaClientOptions) => NpaSupabaseClient;
export interface NpaRuntimeConfig { url: string; anonKey: string; serviceRoleKey: string; }
export interface NpaRuntimeDependencies {
  createClient: NpaCreateClient;
  // Explicitly connect the native server fetch in the Deno entrypoint. A pure
  // factory with no connected transports must not accidentally make requests.
  officialFetch?: typeof fetch;
  projectFetch?: typeof fetch;
  now?: () => Date;
  // Trusted server/test settings may tighten, never raise, the fixed caps.
  rpcTimeoutMs?: number;
  workerTimeoutMs?: number;
  // Explicit isolated-fixture seam. Production templates do not set this.
  observe?: (claim: NpaCheckClaim, dependencies: WorkerDependencies) => Promise<NpaCheckResult>;
}
const denyFetch: typeof fetch = async () => { throw new ProofError('RTN_NPA_TRANSPORT_NOT_CONNECTED'); };

function configuration(value: NpaRuntimeConfig): URL {
  if (!value || ![value.url, value.anonKey, value.serviceRoleKey].every(item => typeof item === 'string' && item.trim() === item && item.length > 0) || value.anonKey === value.serviceRoleKey) throw new Error('RTN_NPA_SERVICE_CONFIGURATION_REQUIRED');
  let url: URL;
  try { url = new URL(value.url); } catch { throw new Error('RTN_NPA_SERVICE_CONFIGURATION_REQUIRED'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('RTN_NPA_SERVICE_CONFIGURATION_REQUIRED');
  return url;
}
function apiScope(base: URL) {
  const path = base.pathname.replace(/\/$/, '');
  return (url: URL) => url.origin === base.origin && [path + '/auth/v1/', path + '/rest/v1/', path + '/storage/v1/'].some(prefix => url.pathname.startsWith(prefix));
}

/** Real fixed public HTTP access check. This is not a browser capability or an
 * approval: the worker subsequently captures the full law/graph/body proof.
 */
export function createActualRuntimeEgressProbe(fetcher: typeof fetch | undefined, options: { signal: AbortSignal; deadlineAtMs: number; now: () => Date }) {
  return async (): Promise<boolean> => {
    if (!fetcher) return false;
    const transport = createBoundedFetch(fetcher, { timeoutMs: 15_000, signal: options.signal, deadlineAtMs: options.deadlineAtMs, now: options.now, maxResponseBytes: 2 * 1024 * 1024,
      allowUrl: url => url.origin === 'http://actual.pravo.gov.ru:8000' && ['/api/ebpi/attrsearch/', '/api/ebpi/redactions/'].includes(url.pathname), rejectRedirects: true });
    try {
      const fixed = { country: 'RU' as const, kind: 'FederalLaw' as const, date: LAW_116.date, number: LAW_116.number, docid: LAW_116.docid, dochash: null };
      const identityResponse = await transport(identityUrl(fixed), { headers: { Accept: 'application/json' } });
      if (identityResponse.status !== 200) { await identityResponse.body?.cancel(); return false; }
      const identity = parseIdentity(await identityResponse.json(), fixed);
      const redResponse = await transport(actualUrl('redactions/', { t: JSON.stringify({ hash: identity.dochash, ttl: 4 }) }), { headers: { Accept: 'application/json' } });
      if (redResponse.status !== 200) { await redResponse.body?.cancel(); return false; }
      const redactions = assertSuccess(await redResponse.json());
      if (redactions.docid !== fixed.docid || redactions.dochash !== identity.dochash || typeof redactions.serverdate !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(redactions.serverdate) || !Array.isArray(redactions.redactions)) return false;
      const today = new Date(options.now().getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const server = calendarDate(redactions.serverdate.slice(0, 10));
      const current = redactions.redactions.map(value => record(value)).filter(row => row.actual === true);
      return server === today && current.length === 1 && calendarDate(current[0].reddate) <= server &&
        ['redofficial', 'redchecked', 'redcompleted', 'hascontent', 'contentcomplete'].every(key => current[0][key] === true);
    } catch { return false; }
  };
}

/** No environment reads, secrets output, service side effects or remote imports
 * at factory creation. The Deno templates inject the pinned SDK and transports.
 */
export function createNpaRuntime(config: NpaRuntimeConfig, dependencies: NpaRuntimeDependencies) {
  const base = configuration(config);
  const now = dependencies.now ?? (() => new Date());
  const projectFetch = dependencies.projectFetch ?? denyFetch;
  const officialFetch = dependencies.officialFetch ?? denyFetch;
  const allowApi = apiScope(base);
  const tightened = (value: number | undefined, cap: number) => {
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new Error('RTN_NPA_INVALID_TRUSTED_BUDGET');
    return Math.min(value ?? cap, cap);
  };
  const rpcTimeoutMs = tightened(dependencies.rpcTimeoutMs, COMPLETION_RPC_MS);
  const workerTimeoutMs = tightened(dependencies.workerTimeoutMs, WHOLE_WORKER_MS);
  const auth = { persistSession: false as const, autoRefreshToken: false as const, detectSessionInUrl: false as const };
  const makeClient = (key: string, signal: AbortSignal, authorization?: string) => {
    const transport = createBoundedFetch(projectFetch, { timeoutMs: PROJECT_HTTP_MS, signal, now, maxResponseBytes: 16 * 1024 * 1024, allowUrl: allowApi, rejectRedirects: true });
    try { return dependencies.createClient(config.url, key, { auth, global: { fetch: transport, ...(authorization ? { headers: { Authorization: authorization } } : {}) } }); }
    catch { throw new Error('RTN_NPA_CLIENT_CONFIGURATION_FAILED'); }
  };
  async function apiOperation<T>(key: string, authorization: string | undefined, action: (client: NpaSupabaseClient, signal: AbortSignal) => PromiseLike<T>): Promise<T> {
    const controller = new AbortController();
    let rejectStop: (error: Error) => void = () => {};
    const stopped = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
    const timer = setTimeout(() => { controller.abort(); rejectStop(new Error('RTN_NPA_DATABASE_TIMEOUT')); }, rpcTimeoutMs);
    try { return await Promise.race([Promise.resolve().then(() => action(makeClient(key, controller.signal, authorization), controller.signal)), stopped]); }
    catch (error) {
      if (error instanceof ProofError) throw error;
      if (error instanceof Error && error.message === 'RTN_NPA_DATABASE_TIMEOUT') throw error;
      throw new Error('RTN_NPA_DATABASE_UNAVAILABLE');
    }
    finally { clearTimeout(timer); controller.abort(); }
  }
  const service: NpaServiceRpc = {
    rpc(name, args) {
      return apiOperation(config.serviceRoleKey, undefined, (client, signal) => {
        const operation = client.rpc(name, args); return operation.abortSignal ? operation.abortSignal(signal) : operation;
      });
    },
  };
  const runDisposers = new WeakMap<WorkerDependencies, () => void>();
  const executor = createNpaExecutor(service, claim => {
    const run = new AbortController();
    const deadlineAtMs = now().getTime() + workerTimeoutMs;
    const timer = setTimeout(() => run.abort(), workerTimeoutMs);
    try {
      const storage = makeClient(config.serviceRoleKey, run.signal).storage;
      const privateArtifactStore = createPrivateArtifactStore(storage, claim.run_id);
      const workerDependencies: WorkerDependencies = {
        privateArtifactStore, fetch: officialFetch, now, signal: run.signal,
        limits: { requestTimeoutMs: 15_000, sourceVerificationTimeoutMs: 35_000, runTimeoutMs: workerTimeoutMs },
        runtimeEgressProbe: createActualRuntimeEgressProbe(dependencies.officialFetch, { signal: run.signal, deadlineAtMs, now }),
        verifyQuestionSource: createQuestionSourceVerifier(claim, {
          fetch: officialFetch, signal: run.signal, deadlineAtMs, now,
          storeForSignal: sourceSignal => createPrivateArtifactStore(makeClient(config.serviceRoleKey, sourceSignal).storage, claim.run_id),
        }),
      };
      runDisposers.set(workerDependencies, () => { clearTimeout(timer); run.abort(); });
      return workerDependencies;
    } catch (error) { clearTimeout(timer); run.abort(); throw error; }
  }, async (claim, workerDependencies) => {
    try { return await (dependencies.observe ?? runOfficialNpaCheck)(claim, workerDependencies); }
    finally { runDisposers.get(workerDependencies)?.(); runDisposers.delete(workerDependencies); }
  }, () => now().getTime());
  return {
    user(authorization: string): GenuineUserClient {
      return {
        auth: { getUser: () => apiOperation(config.anonKey, authorization, client => client.auth.getUser()) },
        rpc: (name, args) => apiOperation(config.anonKey, authorization, (client, signal) => {
          const operation = client.rpc(name, args); return operation.abortSignal ? operation.abortSignal(signal) : operation;
        }),
      };
    },
    execute: executor.execute,
    enqueueDue: executor.enqueueDue,
  };
}
