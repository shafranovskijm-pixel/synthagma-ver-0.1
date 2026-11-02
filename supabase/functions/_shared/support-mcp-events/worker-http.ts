import { constantTimeTextEqual, createSecretCrypto, strictBase64 } from './crypto.ts';
import { createDeliveryWorker, createRpcDeliveryStore, DeliveryWorkerError, type RpcClient } from './delivery.ts';
import { CallbackTransportError, createPinnedHttpsTransport, DENO_NODE_HTTPS_PINNING_PROVEN, type PinnedHttpsTransport } from './pinned-https.ts';

export type RuntimeConfig = { enabled: boolean; encryptionKey: { key_base64: string; kid?: string }; workerToken: string; workerUrl?: string };
type EnvGetter = (name: string) => string | undefined;
export async function loadRuntimeConfig(client: RpcClient, env: EnvGetter): Promise<RuntimeConfig> {
  const key = env('MCP_EVENTS_ENCRYPTION_KEY'), token = env('MCP_EVENTS_WORKER_TOKEN');
  let raw: unknown;
  if (key || token) {
    if (!key || !token) throw new DeliveryWorkerError('delivery_config_invalid');
    raw = { enabled: env('MCP_EVENTS_ENABLED') === 'true', encryptionKey: { key_base64: key }, workerToken: token };
  } else {
    let result: { data: unknown; error: unknown };
    try { result = await client.rpc('sintagma_support_event_runtime_config', {}); }
    catch { throw new DeliveryWorkerError('delivery_store_failed'); }
    if (result.error) throw new DeliveryWorkerError('delivery_store_failed'); raw = result.data;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DeliveryWorkerError('delivery_config_invalid');
  const config = raw as RuntimeConfig;
  if (typeof config.enabled !== 'boolean' || !config.encryptionKey || typeof config.encryptionKey.key_base64 !== 'string' || typeof config.workerToken !== 'string') throw new DeliveryWorkerError('delivery_config_invalid');
  // Vault's metadata kid is not the AES envelope kid. createSecretCrypto derives it.
  strictBase64(config.encryptionKey.key_base64,32,32,'invalid_encryption_key');
  strictBase64(config.workerToken,32,32,'invalid_encryption_key');
  return config;
}
export async function signWake(timestamp: string, nonce: string, workerToken: string, cryptoApi: Crypto = globalThis.crypto): Promise<string> {
  const bytes = strictBase64(workerToken,32,32,'invalid_encryption_key');
  const key = await cryptoApi.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);bytes.fill(0);
  const data = new TextEncoder().encode(`sintagma-support-events-wake-v1\n${timestamp}\n${nonce}`);
  const signature = await cryptoApi.subtle.sign('HMAC',key,data);
  return Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
}
function response(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store' } });
}
async function emptyJsonBody(request: Request): Promise<boolean> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !request.body) return false;
  const reader = request.body.getReader(); const bytes: number[] = []; let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => { while (true) { const item=await reader.read();if(item.done)break;
        if(bytes.length+item.value.byteLength>2){await reader.cancel();return false;}for(const b of item.value)bytes.push(b);
      }return bytes.length===2&&bytes[0]===123&&bytes[1]===125; })(),
      new Promise<boolean>(resolve=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});resolve(false);},2000);}),
    ]);
  } catch { return false; } finally { if(timer)clearTimeout(timer); }
}
export type WorkerHttpOptions = {
  client: RpcClient; env: EnvGetter; transport?: PinnedHttpsTransport; crypto?: Crypto; now?: () => number;
  loadConfig?: () => Promise<RuntimeConfig>;
};
export function createWorkerHttpHandler(options: WorkerHttpOptions): (request: Request) => Promise<Response> {
  const cryptoApi=options.crypto??globalThis.crypto, now=options.now??Date.now;
  const transport=options.transport??createPinnedHttpsTransport();
  const configLoader=options.loadConfig??(()=>loadRuntimeConfig(options.client,options.env));
  return async function handle(request) {
    if(request.method!=='POST')return response(405,{error:'method_not_allowed'});
    if(!(await emptyJsonBody(request)))return response(400,{error:'invalid_body'});
    try {
      const url=new URL(request.url);
      if(url.searchParams.has('probe')) {
        if(url.searchParams.get('probe')!=='pinning'||url.searchParams.size!==1)return response(400,{error:'invalid_request'});
        const serviceKey=options.env('SUPABASE_SERVICE_ROLE_KEY');
        const authorization=request.headers.get('authorization')??'';
        if(!serviceKey||authorization.length>4096||!(await constantTimeTextEqual(`Bearer ${serviceKey}`,authorization,cryptoApi)))return response(401,{error:'unauthorized'});
        const config=await configLoader();
        if(config.enabled)return response(409,{error:'probe_requires_disabled_delivery'});
        if(!transport.probeRuntime)return response(503,{error:'runtime_not_proven'});
        const probe=await transport.probeRuntime();
        return response(200,{probe:'pinning',observed:true,httpStatus:probe.status,deliveryEnabled:false,readinessMarker:DENO_NODE_HTTPS_PINNING_PROVEN});
      }
      if(url.search)return response(400,{error:'invalid_request'});
      const timestamp=request.headers.get('x-sintagma-events-timestamp')??'';
      const nonce=request.headers.get('x-sintagma-events-nonce')??'';
      const supplied=request.headers.get('x-sintagma-events-signature')??'';
      if(!/^[1-9][0-9]{9,12}$/.test(timestamp)||!Number.isSafeInteger(Number(timestamp))||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(nonce)||!/^[0-9a-f]{64}$/.test(supplied))return response(401,{error:'unauthorized'});
      const seconds=Math.floor(now()/1000),signed=Number(timestamp);
      if(seconds-signed>60||signed-seconds>5)return response(401,{error:'unauthorized'});
      const config=await configLoader();
      const expected=await signWake(timestamp,nonce,config.workerToken,cryptoApi);
      if(!(await constantTimeTextEqual(expected,supplied,cryptoApi)))return response(401,{error:'unauthorized'});
      if(!config.enabled)return response(202,{enabled:false,delivered:false});
      let consumed:{data:unknown;error:unknown};
      try{consumed=await options.client.rpc('sintagma_support_event_consume_wake_nonce',{p_nonce:nonce,p_timestamp:signed});}
      catch{throw new DeliveryWorkerError('delivery_store_failed');}
      if(consumed.error)throw new DeliveryWorkerError('delivery_store_failed');
      if(consumed.data!==true)return response(409,{error:'wake_replayed_or_expired'});
      transport.assertReady();
      const secrets=await createSecretCrypto(config.encryptionKey.key_base64,cryptoApi);
      const worker=createDeliveryWorker({store:createRpcDeliveryStore(options.client),crypto:secrets,transport,now});
      const result=await worker.runOnce(cryptoApi.randomUUID(),3);
      return response(200,{enabled:true,...result});
    } catch(error) {
      if(error instanceof CallbackTransportError)return response(503,{error:error.reason});
      if(error instanceof DeliveryWorkerError)return response(503,{error:error.code});
      return response(503,{error:'worker_failed'});
    }
  };
}
