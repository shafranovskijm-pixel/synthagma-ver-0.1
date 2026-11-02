import { ownedArrayBuffer } from './crypto-buffer.ts';
import { constantTimeTextEqual, createSecretCrypto, strictBase64 } from './crypto.ts';
import { createDeliveryWorker, createRpcDeliveryStore, DeliveryWorkerError, type RpcClient } from './delivery.ts';
import { CallbackTransportError, NativeHttpsTransportError, NATIVE_RUNTIME_PHASES, safeNativePinDiagnostics, createPinnedHttpsTransport, DENO_NODE_HTTPS_PINNING_PROVEN, DENO_NATIVE_HTTPS_PINNING_PROVEN, type PinnedHttpsTransport } from './pinned-https.ts';

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
type ControlPurpose = 'sintagma-support-events-wake-v1' | 'sintagma-support-events-probe-v1';
async function signControl(purpose: ControlPurpose, timestamp: string, nonce: string, workerToken: string, cryptoApi: Crypto): Promise<string> {
  const bytes = strictBase64(workerToken,32,32,'invalid_encryption_key');
  const rawKey = ownedArrayBuffer(bytes);
  let key: CryptoKey;
  try { key = await cryptoApi.subtle.importKey('raw',rawKey,{name:'HMAC',hash:'SHA-256'},false,['sign']); }
  finally { bytes.fill(0); new Uint8Array(rawKey).fill(0); }
  const data = new TextEncoder().encode(`${purpose}\n${timestamp}\n${nonce}`);
  const signature = await cryptoApi.subtle.sign('HMAC',key,data);
  return Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
}
export function signWake(timestamp: string, nonce: string, workerToken: string, cryptoApi: Crypto = globalThis.crypto): Promise<string> {
  return signControl('sintagma-support-events-wake-v1',timestamp,nonce,workerToken,cryptoApi);
}
export function signProbe(timestamp: string, nonce: string, workerToken: string, cryptoApi: Crypto = globalThis.crypto): Promise<string> {
  return signControl('sintagma-support-events-probe-v1',timestamp,nonce,workerToken,cryptoApi);
}
type ControlEnvelope = { timestamp: string; nonce: string; supplied: string; signed: number };
function controlEnvelope(request: Request): ControlEnvelope | null {
  const allowed=new Set(['x-sintagma-events-timestamp','x-sintagma-events-nonce','x-sintagma-events-signature']);
  let unknown=false;
  request.headers.forEach((_value,name)=>{if(name.startsWith('x-sintagma-events-')&&!allowed.has(name))unknown=true;});
  const timestamp=request.headers.get('x-sintagma-events-timestamp')??'';
  const nonce=request.headers.get('x-sintagma-events-nonce')??'';
  const supplied=request.headers.get('x-sintagma-events-signature')??'';
  if(unknown||!/^[1-9][0-9]{9,12}$/.test(timestamp)||!Number.isSafeInteger(Number(timestamp))||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(nonce)||!/^[0-9a-f]{64}$/.test(supplied))return null;
  return{timestamp,nonce,supplied,signed:Number(timestamp)};
}
function controlIsFresh(envelope: ControlEnvelope, now: number): boolean {
  const seconds=Math.floor(now/1000);
  return seconds-envelope.signed<=60&&envelope.signed-seconds<=5;
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
    let authenticatedProbe=false;
    try {
      const url=new URL(request.url);
      if(url.searchParams.has('probe')) {
        if(url.searchParams.get('probe')!=='pinning'||url.searchParams.size!==1)return response(400,{error:'invalid_request'});
        let config:RuntimeConfig;
        let probeEnvelope:ControlEnvelope|null=null;
        if(request.headers.has('authorization')) {
          // Preserve the existing service-only probe. Never fall through from a
          // bad Bearer credential to another authentication mode or mix modes.
          let mixed=false;request.headers.forEach((_value,name)=>{if(name.startsWith('x-sintagma-events-'))mixed=true;});
          const serviceKey=options.env('SUPABASE_SERVICE_ROLE_KEY'),authorization=request.headers.get('authorization')??'';
          if(mixed||!serviceKey||authorization.length>4096||!(await constantTimeTextEqual(`Bearer ${serviceKey}`,authorization,cryptoApi)))return response(401,{error:'unauthorized'});
          config=await configLoader();
        } else {
          probeEnvelope=controlEnvelope(request);
          if(!probeEnvelope||!controlIsFresh(probeEnvelope,now()))return response(401,{error:'unauthorized'});
          config=await configLoader();
          const expected=await signProbe(probeEnvelope.timestamp,probeEnvelope.nonce,config.workerToken,cryptoApi);
          if(!(await constantTimeTextEqual(expected,probeEnvelope.supplied,cryptoApi)))return response(401,{error:'unauthorized'});
        }
        if(config.enabled)return response(409,{error:'probe_requires_disabled_delivery'});
        if(probeEnvelope) {
          let consumed:{data:unknown;error:unknown};
          try{consumed=await options.client.rpc('sintagma_support_event_consume_probe_nonce',{p_nonce:probeEnvelope.nonce,p_timestamp:probeEnvelope.signed});}
          catch{throw new DeliveryWorkerError('delivery_store_failed');}
          if(consumed.error)throw new DeliveryWorkerError('delivery_store_failed');
          if(consumed.data!==true)return response(409,{error:'probe_replayed_or_expired'});
        }
        authenticatedProbe=true;
        if(!transport.probeRuntime)return response(503,{error:'runtime_not_proven'});
        const probe=await transport.probeRuntime();
        const implementation=probe.implementation??transport.implementation;
        const native=implementation==='deno-native-http1';
        const pinDiagnostics=native?safeNativePinDiagnostics(probe.pinDiagnostics):undefined;
        return response(200,{probe:'pinning',observed:true,httpStatus:probe.status,deliveryEnabled:false,readinessMarker:DENO_NODE_HTTPS_PINNING_PROVEN,
          ...(native?{implementation,nativeReadinessMarker:DENO_NATIVE_HTTPS_PINNING_PROVEN}:implementation==='node-https'?{implementation}:{}),...(pinDiagnostics?{pinDiagnostics}:{})});
      }
      if(url.search)return response(400,{error:'invalid_request'});
      const envelope=controlEnvelope(request);
      if(!envelope||!controlIsFresh(envelope,now()))return response(401,{error:'unauthorized'});
      const config=await configLoader();
      const expected=await signWake(envelope.timestamp,envelope.nonce,config.workerToken,cryptoApi);
      if(!(await constantTimeTextEqual(expected,envelope.supplied,cryptoApi)))return response(401,{error:'unauthorized'});
      if(!config.enabled)return response(202,{enabled:false,delivered:false});
      let consumed:{data:unknown;error:unknown};
      try{consumed=await options.client.rpc('sintagma_support_event_consume_wake_nonce',{p_nonce:envelope.nonce,p_timestamp:envelope.signed});}
      catch{throw new DeliveryWorkerError('delivery_store_failed');}
      if(consumed.error)throw new DeliveryWorkerError('delivery_store_failed');
      if(consumed.data!==true)return response(409,{error:'wake_replayed_or_expired'});
      transport.assertReady();
      const secrets=await createSecretCrypto(config.encryptionKey.key_base64,cryptoApi);
      const worker=createDeliveryWorker({store:createRpcDeliveryStore(options.client),crypto:secrets,transport,now});
      const result=await worker.runOnce(cryptoApi.randomUUID(),3);
      return response(200,{enabled:true,...result});
    } catch(error) {
      if(error instanceof CallbackTransportError){
        const httpStatus=error.httpStatus;
        // Only the authenticated fixed probe may expose this bounded value.
        // HMAC mode has consumed its nonce; never return URLs, IPs or messages.
        const diagnostic=authenticatedProbe&&typeof httpStatus==='number'&&Number.isInteger(httpStatus)&&httpStatus>=200&&httpStatus<=599?{httpStatus}:{};
        const implementation=transport.implementation;
        const implementationDiagnostic=authenticatedProbe&&(implementation==='deno-native-http1'||implementation==='node-https')?{implementation}:{};
        const nativeDiagnostic=authenticatedProbe&&error instanceof NativeHttpsTransportError&&NATIVE_RUNTIME_PHASES.includes(error.phase)?{implementation:'deno-native-http1',phase:error.phase}:{};
        const pinDiagnostics=authenticatedProbe&&error instanceof NativeHttpsTransportError?safeNativePinDiagnostics(error.pinDiagnostics):undefined;
        return response(503,{error:error.reason,...diagnostic,...implementationDiagnostic,...nativeDiagnostic,...(pinDiagnostics?{pinDiagnostics}:{})});
      }
      if(error instanceof DeliveryWorkerError)return response(503,{error:error.code});
      return response(503,{error:'worker_failed'});
    }
  };
}
