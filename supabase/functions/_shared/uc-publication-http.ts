import { parsePublicPublicationUrl } from "./uc-publication-url.ts";

// Deno.connect to a reviewed numeric A record, then startTls with the original
// hostname. Neither fetch's second DNS lookup nor a user-supplied proxy is used.
// https://docs.deno.com/api/deno/network/#function-denostarttls
export interface PublicationConnection {
  read(buffer: Uint8Array): Promise<number | null>;
  write(buffer: Uint8Array): Promise<number>;
  close(): void;
  remoteAddr: { transport?: string; hostname?: string; port?: number };
  handshake?: () => Promise<{ alpnProtocol: string | null }>;
}
export interface PublicationNetwork {
  resolveDns(hostname: string, type: "A"): Promise<string[]>;
  connect(options: { hostname: string; port: 443; transport: "tcp" }): Promise<PublicationConnection>;
  startTls(connection: PublicationConnection, options: { hostname: string; alpnProtocols: ["http/1.1"] }): Promise<PublicationConnection>;
}
export interface AnonymousPublicationObservation {
  result: "verified" | "hash_mismatch" | "mime_mismatch" | "http_unavailable" | "unsafe_target";
  requestedUrl: string; finalUrl: string; checkedAt: string; httpStatus: number | null;
  observed: { sha256: string; bytes: number; mime: string } | null;
  responseHeadersSha256: string | null; redirectCount: number;
  observer: "platform_anonymous_https"; transport: "public_addresses_pinned_tls_hostname_checked";
}
type FailureCode = "UNSAFE_TARGET" | "UNAVAILABLE";
class ObservationFailure extends Error {
  constructor(readonly code: FailureCode) { super(code); }
}
const unavailable = (): never => { throw new ObservationFailure("UNAVAILABLE"); };
type UnsafeTargetReason = "redirect_cycle" | "dns_answer_shape" | "dns_answer_empty" | "dns_answer_limit" | "dns_answer_nonpublic" | "tcp_transport" | "tcp_hostname" | "tcp_port" | "tls_transport" | "tls_hostname" | "tls_port" | "tls_handshake_missing" | "redirect_location_missing" | "redirect_limit" | "redirect_target";
const unsafe = (reason: UnsafeTargetReason): never => {
  // Closed guard code only: never pass request, peer, response, credential or error values.
  try { console.warn("[PublicationCheckGuard]", reason); } catch { /* Diagnostics cannot change a refusal. */ }
  throw new ObservationFailure("UNSAFE_TARGET");
};
const MAX_BYTES = 20 * 1024 * 1024, MAX_HEADERS = 32 * 1024, MAX_WIRE = MAX_BYTES + 1024 * 1024;
const encoder = new TextEncoder();

/** Deliberately IPv4-only egress. No IPv6, mapped IPv4, decimal/octal IP or fallback connection is attempted. */
export function isPublicPublicationIpv4(value: string): boolean {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return false;
  const [a, b, c, d] = value.split(".").map(Number);
  if ([a, b, c, d].some(part => part > 255)) return false;
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}

const concatenate = (chunks: readonly Uint8Array[], total: number): Uint8Array => {
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
};
const sha256 = async (value: Uint8Array): Promise<string> => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(value)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
const endOfHeaders = (raw: Uint8Array): number => {
  for (let i = 0; i < raw.length - 3; i++) if (raw[i] === 13 && raw[i + 1] === 10 && raw[i + 2] === 13 && raw[i + 3] === 10) return i + 4;
  return -1;
};
interface ParsedHeaders { status: number; headers: Map<string, string>; end: number }
function parseHeaders(raw: Uint8Array): ParsedHeaders {
  const end = endOfHeaders(raw);
  if (end < 0 || end > MAX_HEADERS) return unavailable();
  const bytes = raw.subarray(0, end);
  if (bytes.some(byte => byte > 126 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13))) return unavailable();
  const lines = new TextDecoder("ascii").decode(bytes).slice(0, -4).split("\r\n");
  const first = /^HTTP\/1\.[01] ([1-5]\d\d)(?: [\x20-\x7e]*)?$/.exec(lines.shift() ?? "");
  if (!first || lines.length > 100) return unavailable();
  const headers = new Map<string, string>();
  for (const line of lines) {
    const match = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*([^\r\n]*)$/.exec(line);
    if (!match || /^[ \t]/.test(line) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(match[2])) return unavailable();
    const name = match[1].toLowerCase();
    // Strict single-value framing and location; repeated ancillary headers are not used.
    if (headers.has(name) && ["content-length", "transfer-encoding", "content-type", "content-encoding", "location"].includes(name)) return unavailable();
    if (!headers.has(name)) headers.set(name, match[2].trim());
  }
  if (headers.has("content-length") && headers.has("transfer-encoding")) return unavailable();
  const length = headers.get("content-length");
  if (length !== undefined && (!/^(?:0|[1-9]\d*)$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > MAX_BYTES)) return unavailable();
  if (headers.has("transfer-encoding") && headers.get("transfer-encoding")?.toLowerCase() !== "chunked") return unavailable();
  if (headers.has("content-encoding") && headers.get("content-encoding")?.toLowerCase() !== "identity") return unavailable();
  return { status: Number(first[1]), headers, end };
}

function unchunk(raw: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []; let offset = 0, total = 0, count = 0;
  const line = (): string => {
    const start = offset;
    while (offset + 1 < raw.length && !(raw[offset] === 13 && raw[offset + 1] === 10)) offset++;
    if (offset + 1 >= raw.length || offset - start > 1024) return unavailable();
    const text = new TextDecoder("ascii").decode(raw.subarray(start, offset)); offset += 2; return text;
  };
  while (offset < raw.length) {
    if (++count > 65_536) return unavailable();
    const size = line();
    // Chunk extensions are not needed for the reviewed public document transport.
    if (!/^[0-9a-fA-F]{1,8}$/.test(size)) return unavailable();
    const n = Number.parseInt(size, 16);
    if (n === 0) {
      let trailers = 0;
      for (let value = line(); value !== ""; value = line()) {
        if (++trailers > 32 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+:[\x20-\x7e\t]*$/.test(value)) return unavailable();
      }
      if (offset !== raw.length) return unavailable();
      return concatenate(chunks, total);
    }
    if (total + n > MAX_BYTES || offset + n + 2 > raw.length || raw[offset + n] !== 13 || raw[offset + n + 1] !== 10) return unavailable();
    chunks.push(raw.subarray(offset, offset + n)); total += n; offset += n + 2;
  }
  return unavailable();
}

/** Exposed for byte-level regression tests; no body is returned by the persisted check facade. */
export function parsePublicPublicationResponse(raw: Uint8Array): { status: number; headers: Map<string, string>; body: Uint8Array } {
  if (raw.length > MAX_WIRE) return unavailable();
  const parsed = parseHeaders(raw); let body = raw.subarray(parsed.end);
  if (parsed.headers.get("transfer-encoding")) body = unchunk(body);
  else if (parsed.headers.has("content-length") && body.length !== Number(parsed.headers.get("content-length"))) return unavailable();
  if (body.length > MAX_BYTES) return unavailable();
  return { status: parsed.status, headers: parsed.headers, body };
}


/** deno_net startTls returns its native IpAddr without the JS connectTls transport marker.
 * Accept only that exact own-data shape with an ordinary or null prototype after upgrading the already checked TCP peer.
 * The real-hostname TLS handshake and the independent peer checks below remain mandatory.
 */
function isPinnedNativeStartTlsPeer(peer: unknown, tcpPeer: PublicationConnection["remoteAddr"], address: string): boolean {
  if (tcpPeer.transport !== "tcp" || tcpPeer.hostname !== address || tcpPeer.port !== 443) return false;
  if (!peer || typeof peer !== "object") return false;
  const prototype = Object.getPrototypeOf(peer);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(peer);
  if (keys.length !== 2 || !keys.includes("hostname") || !keys.includes("port")) return false;
  const hostname = Object.getOwnPropertyDescriptor(peer, "hostname"), port = Object.getOwnPropertyDescriptor(peer, "port");
  return Boolean(hostname && "value" in hostname && hostname.value === address && port && "value" in port && port.value === 443);
}

// Fixed build identity and closed shape only. No peer values, property names or errors leave this refusal.
function logRejectedTlsPeerShape(connection: PublicationConnection, tcpConnection: PublicationConnection, address: string): void {
  type Shape = {
    inspection: "complete" | "unavailable";
    transport: "absent" | "tcp" | "other";
    prototype: "ordinary" | "null" | "other";
    ownKeyCount: "0" | "1" | "2" | "3" | "4_plus" | "unavailable";
    hostnameDescriptor: "absent" | "data" | "accessor";
    portDescriptor: "absent" | "data" | "accessor";
    hostnameMatchesPinned: boolean; portMatches443: boolean;
    tcpHostnameMatchesPinned: boolean; tcpPortMatches443: boolean;
  };
  let shape: Shape = { inspection: "unavailable", transport: "other", prototype: "other", ownKeyCount: "unavailable",
    hostnameDescriptor: "absent", portDescriptor: "absent", hostnameMatchesPinned: false, portMatches443: false,
    tcpHostnameMatchesPinned: false, tcpPortMatches443: false };
  try {
    const peer = connection.remoteAddr, tcpPeer = tcpConnection.remoteAddr;
    if (peer && typeof peer === "object" && tcpPeer && typeof tcpPeer === "object") {
      const prototype = Object.getPrototypeOf(peer), count = Reflect.ownKeys(peer).length;
      const transport = Object.getOwnPropertyDescriptor(peer, "transport");
      const hostname = Object.getOwnPropertyDescriptor(peer, "hostname"), port = Object.getOwnPropertyDescriptor(peer, "port");
      const tcpHostname = Object.getOwnPropertyDescriptor(tcpPeer, "hostname"), tcpPort = Object.getOwnPropertyDescriptor(tcpPeer, "port");
      shape = { inspection: "complete",
        transport: !transport ? "absent" : "value" in transport && transport.value === "tcp" ? "tcp" : "other",
        prototype: prototype === Object.prototype ? "ordinary" : prototype === null ? "null" : "other",
        ownKeyCount: count === 0 ? "0" : count === 1 ? "1" : count === 2 ? "2" : count === 3 ? "3" : "4_plus",
        hostnameDescriptor: !hostname ? "absent" : "value" in hostname ? "data" : "accessor",
        portDescriptor: !port ? "absent" : "value" in port ? "data" : "accessor",
        hostnameMatchesPinned: Boolean(hostname && "value" in hostname && hostname.value === address),
        portMatches443: Boolean(port && "value" in port && port.value === 443),
        tcpHostnameMatchesPinned: Boolean(tcpHostname && "value" in tcpHostname && tcpHostname.value === address),
        tcpPortMatches443: Boolean(tcpPort && "value" in tcpPort && tcpPort.value === 443) };
    }
  } catch { /* Uninspectable shapes stay closed; no exception text or partial values are emitted. */ }
  try { console.warn("[PublicationCheckPeerShape]", "uc026-tls-peer-shape-20261026-v1", shape); }
  catch { /* Diagnostics cannot change the original refusal. */ }
}

function defaultNetwork(): PublicationNetwork {
  const runtime = (globalThis as unknown as { Deno?: PublicationNetwork }).Deno;
  if (!runtime || typeof runtime.resolveDns !== "function" || typeof runtime.connect !== "function" || typeof runtime.startTls !== "function") return unavailable();
  return runtime;
}

export async function observePublicPublication(input: { publicUrl: string; content: { sha256: string; bytes: number; mime: string } },
  network: PublicationNetwork = defaultNetwork()): Promise<AnonymousPublicationObservation> {
  const requestedUrl = parsePublicPublicationUrl(input.publicUrl);
  if (!/^[0-9a-f]{64}$/.test(input.content.sha256) || !Number.isSafeInteger(input.content.bytes)
    || input.content.bytes < 1 || input.content.bytes > MAX_BYTES || !["application/pdf", "text/html", "text/plain", "image/png", "image/jpeg"].includes(input.content.mime)) throw new Error("INVALID_PUBLICATION_CONTENT");
  const started = Date.now(); let connection: PublicationConnection | null = null, expired = false, finalUrl = requestedUrl;
  let redirectCount = 0, status: number | null = null;
  const close = () => { try { connection?.close(); } catch { /* already consumed/closed */ } connection = null; };
  let rejectTimeout!: (reason: unknown) => void;
  const timeout = new Promise<never>((_, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => { expired = true; close(); rejectTimeout(new ObservationFailure("UNAVAILABLE")); }, 15_000);
  // Race every step with one shared budget; late connections are explicitly closed.
  const bounded = <T,>(operation: Promise<T>): Promise<T> => Promise.race([operation, timeout]);
  const hold = async (operation: Promise<PublicationConnection>): Promise<PublicationConnection> => {
    const value = await bounded(operation.then(conn => { if (expired) { try { conn.close(); } catch { /* closed */ } return unavailable(); } return conn; }));
    connection = value; return value;
  };
  const result = (kind: AnonymousPublicationObservation["result"], observed: AnonymousPublicationObservation["observed"] = null, headersHash: string | null = null): AnonymousPublicationObservation => ({
    result: kind, requestedUrl, finalUrl, checkedAt: new Date().toISOString(), httpStatus: status, observed,
    responseHeadersSha256: headersHash, redirectCount, observer: "platform_anonymous_https", transport: "public_addresses_pinned_tls_hostname_checked",
  });
  try {
    const visited = new Set<string>();
    while (true) {
      if (expired || Date.now() - started >= 15_000) return unavailable();
      if (visited.has(finalUrl)) return unsafe("redirect_cycle");
      visited.add(finalUrl);
      const url = new URL(finalUrl), addresses = await bounded(network.resolveDns(url.hostname, "A"));
      if (!Array.isArray(addresses)) return unsafe("dns_answer_shape");
      if (!addresses.length) return unsafe("dns_answer_empty");
      if (addresses.length > 32) return unsafe("dns_answer_limit");
      if (addresses.some(address => !isPublicPublicationIpv4(address))) return unsafe("dns_answer_nonpublic");
      const address = [...new Set(addresses)].sort()[0];
      const tcp = await hold(network.connect({ hostname: address, port: 443, transport: "tcp" }));
      if (tcp.remoteAddr.transport !== "tcp") return unsafe("tcp_transport");
      if (tcp.remoteAddr.hostname !== address) return unsafe("tcp_hostname");
      if (tcp.remoteAddr.port !== 443) return unsafe("tcp_port");
      const tls = await hold(network.startTls(tcp, { hostname: url.hostname, alpnProtocols: ["http/1.1"] }));
      if (tls.remoteAddr.transport !== "tcp" && !isPinnedNativeStartTlsPeer(tls.remoteAddr, tcp.remoteAddr, address)) {
        logRejectedTlsPeerShape(tls, tcp, address);
        return unsafe("tls_transport");
      }
      if (tls.remoteAddr.hostname !== address) return unsafe("tls_hostname");
      if (tls.remoteAddr.port !== 443) return unsafe("tls_port");
      if (typeof tls.handshake !== "function") return unsafe("tls_handshake_missing");
      const handshake = await bounded(tls.handshake());
      if (handshake.alpnProtocol !== null && handshake.alpnProtocol !== "http/1.1") return unavailable();
      const request = encoder.encode(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}\r\nAccept: application/pdf,text/html,text/plain,image/png,image/jpeg\r\nAccept-Encoding: identity\r\nConnection: close\r\nUser-Agent: Sintagma-Publication-Check/1\r\n\r\n`);
      let written = 0;
      while (written < request.length) { const n = await bounded(tls.write(request.subarray(written))); if (!Number.isInteger(n) || n < 1 || n > request.length - written) return unavailable(); written += n; }
      const chunks: Uint8Array[] = []; let total = 0, parsed: ParsedHeaders | null = null;
      while (true) {
        const buffer = new Uint8Array(64 * 1024), n = await bounded(tls.read(buffer));
        if (n === null) break;
        if (!Number.isInteger(n) || n < 1 || n > buffer.length || total + n > MAX_WIRE) return unavailable();
        chunks.push(buffer.slice(0, n)); total += n;
        if (!parsed) {
          const prefix = concatenate(chunks, total);
          if (endOfHeaders(prefix) >= 0) parsed = parseHeaders(prefix);
          else if (total > MAX_HEADERS) return unavailable();
          if (parsed && [301, 302, 303, 307, 308].includes(parsed.status)) break;
        }
        if (parsed?.headers.has("content-length") && total - parsed.end >= Number(parsed.headers.get("content-length"))) break;
      }
      close();
      const raw = concatenate(chunks, total);
      if (!parsed) parsed = parseHeaders(raw);
      status = parsed.status;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = parsed.headers.get("location");
        if (!location) return unsafe("redirect_location_missing");
        if (redirectCount >= 3) return unsafe("redirect_limit");
        let next: string;
        try { next = parsePublicPublicationUrl(new URL(location, finalUrl).href); } catch { return unsafe("redirect_target"); }
        finalUrl = next; redirectCount++; status = null; continue;
      }
      if (status !== 200) return result("http_unavailable");
      const response = parsePublicPublicationResponse(raw);
      if (response.body.length < 1) return unavailable();
      const mime = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
      if (!mime || mime.length > 200) return unavailable();
      const observed = { sha256: await bounded(sha256(response.body)), bytes: response.body.length, mime };
      const safeHeaders = [status, response.headers.get("content-type") ?? "", response.headers.get("content-length") ?? "", response.headers.get("transfer-encoding") ?? "", response.headers.get("content-encoding") ?? ""];
      const headersHash = await bounded(sha256(encoder.encode(JSON.stringify(safeHeaders))));
      if (mime !== input.content.mime) return result("mime_mismatch", observed, headersHash);
      if (observed.sha256 !== input.content.sha256 || observed.bytes !== input.content.bytes) return result("hash_mismatch", observed, headersHash);
      return result("verified", observed, headersHash);
    }
  } catch (error) {
    // Raw exception text, network addresses, headers, body and credentials are never logged or returned.
    return result(error instanceof ObservationFailure && error.code === "UNSAFE_TARGET" ? "unsafe_target" : "http_unavailable");
  } finally { clearTimeout(timer); close(); }
}
