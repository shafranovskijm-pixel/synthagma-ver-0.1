/** Shared callback syntax/public-IP policy and safe transport contracts. */
import {isIP} from 'node:net';

export type TransportReason = 'invalid_callback' | 'destination_not_public' | 'dns_failed' | 'network_error' | 'tls_failed' | 'timeout' | 'redirect_blocked' | 'response_too_large' | 'payload_too_large' | 'runtime_not_proven' | 'pinning_failed';
export class CallbackTransportError extends Error {
  readonly reason: TransportReason; readonly httpStatus?: number;
  constructor(reason: TransportReason, httpStatus?: number) {
    super(reason); this.name = 'CallbackTransportError'; this.reason = reason;
    if (httpStatus !== undefined) this.httpStatus = httpStatus;
  }
}
export type ResolvedAddress = { address: string; family: 4 | 6 };
export type PostInput = { url: string; body: Uint8Array; headers: Record<string, string>; responseLimitBytes?: number; signal?: AbortSignal };
export type PostResult = { status: number; body: Uint8Array };
export type PinnedHttpsTransport = { assertReady(): void; post(input: PostInput): Promise<PostResult>; readonly implementation?: TransportImplementation; probeRuntime?(): Promise<{ status: number; implementation?: TransportImplementation }> };
export type TransportImplementation='node-https'|'deno-native-http1';
export const NATIVE_RUNTIME_PHASES=['dns','connect','raw_pin','tls','handshake','tls_pin','write','headers','body'] as const;
export type NativeRuntimePhase=typeof NATIVE_RUNTIME_PHASES[number];
export class NativeHttpsTransportError extends CallbackTransportError {
  readonly implementation='deno-native-http1' as const;
  readonly phase:NativeRuntimePhase;
  constructor(reason:TransportReason,phase:NativeRuntimePhase,httpStatus?:number){super(reason,httpStatus);this.name='NativeHttpsTransportError';this.phase=phase;}
}
export const PINNING_PROBE_URL='https://developers.openai.com/plugins/build/mcp-events';

export function canonicalizeCallback(raw: string): string {
  if (typeof raw !== 'string' || raw.length > 4096 || /[\s\u0000-\u001f\u007f#\\]/.test(raw)) throw new CallbackTransportError('invalid_callback');
  let u: URL; try { u = new URL(raw); } catch { throw new CallbackTransportError('invalid_callback'); }
  const host = u.hostname.toLowerCase();
  // IP literals and single-label/internal names are deliberately unsupported.
  if (u.protocol !== 'https:' || (u.port !== '' && u.port !== '443') || u.username || u.password ||
      host.length > 253 || host.endsWith('.') || host.startsWith('[') || isIP(host) || !host.includes('.') ||
      !host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid|example)$/.test(host)) throw new CallbackTransportError('invalid_callback');
  return u.href;
}
function ipv4Number(ip: string): number | null {
  if (isIP(ip) !== 4) return null;
  return ip.split('.').reduce((n, x) => n * 256 + Number(x), 0);
}
function inV4(ip: number, base: string, bits: number): boolean {
  const n = ipv4Number(base)!; const width = 2 ** (32 - bits);
  return Math.floor(ip / width) === Math.floor(n / width);
}
function ipv6Words(ip: string): number[] | null {
  if (isIP(ip) !== 6 || ip.includes('.') || ip.includes('%')) return null;
  const pieces = ip.split('::'); if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(':').map((x) => parseInt(x, 16)) : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(':').map((x) => parseInt(x, 16)) : [];
  return pieces.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right] : left;
}
export function isPublicAddress(ip: string): boolean {
  const v4 = ipv4Number(ip);
  if (v4 !== null) {
    const denied: [string, number][] = [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]];
    return !denied.some(([base,bits]) => inV4(v4,base,bits));
  }
  const w = ipv6Words(ip); if (!w || w.length !== 8) return false;
  // Only global unicast 2000::/3; exclude special-use 2001::/23,
  // documentation 2001:db8::/32 and 3fff::/20, and all 6to4 2002::/16.
  return (w[0] & 0xe000) === 0x2000 && !(w[0] === 0x2001 && w[1] < 0x0200) &&
    !(w[0] === 0x2001 && w[1] === 0x0db8) && w[0] !== 0x2002 && !(w[0] === 0x3fff && w[1] < 0x1000);
}
export function sameAddress(a: string, b: string): boolean {
  if (isIP(a) !== isIP(b)) return false;
  if (isIP(a) === 4) return ipv4Number(a) === ipv4Number(b);
  return JSON.stringify(ipv6Words(a)) === JSON.stringify(ipv6Words(b));
}
