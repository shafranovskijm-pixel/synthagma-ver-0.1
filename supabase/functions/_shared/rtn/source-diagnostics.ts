const STAGES = [
  'read_claim', 'service_catalog_fetch', 'service_catalog_hash', 'service_catalog_decode', 'service_catalog_discover',
  'question_catalog_fetch', 'question_catalog_hash', 'question_catalog_decode', 'a1_section_discover',
  'question_page_fetch', 'question_page_decode', 'question_page_hash', 'document_discover',
  'approval_title_discover', 'approval_title_fetch', 'approval_title_validate', 'approval_title_store',
  'document_fetch', 'document_validate', 'document_hash', 'document_store', 'normalization', 'prepare_completion',
] as const;
export type SourceCheckStage = typeof STAGES[number];

const NAMES = new Set(['Error', 'TypeError', 'URIError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError',
  'AggregateError', 'DOMException', 'AbortError', 'TimeoutError', 'NetworkError', 'NotFound']);
const CODES = new Set(['CERTIFICATE_VERIFY_FAILED', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'EHOSTUNREACH', 'ENETUNREACH', 'ABORT_ERR']);
type Transport = 'tls_certificate' | 'tls_handshake' | 'dns' | 'connection_refused' | 'connection_reset'
  | 'timeout' | 'network_unreachable' | 'aborted' | 'unclassified';
type ExceptionSummary = { name: string; code?: string; transport: Transport };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function field(value: unknown, key: string): unknown {
  try { return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined; }
  catch { return undefined; }
}
function id(value: unknown): string { return typeof value === 'string' && UUID.test(value) ? value : 'unknown'; }

function summarize(error: unknown): ExceptionSummary {
  const rawName = field(error, 'name'), rawCode = field(error, 'code'), rawMessage = field(error, 'message');
  const name = typeof rawName === 'string' && NAMES.has(rawName) ? rawName : 'unknown';
  const code = typeof rawCode === 'string' && CODES.has(rawCode) ? rawCode : undefined;
  // Read at most a bounded native message to classify it. No message, URL,
  // stack, response, headers or arbitrary code can leave this function.
  const message = typeof rawMessage === 'string' ? rawMessage.slice(0, 4096) : '';
  let transport: Transport = 'unclassified';
  if (name === 'AbortError' || code === 'ABORT_ERR') transport = 'aborted';
  else if ((code !== undefined && /^(?:CERTIFICATE_|CERT_|ERR_TLS_CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_)/.test(code))
    || /UnknownIssuer|invalid peer certificate|certificate verify failed|unable to (?:get|verify).*certificate|self[- ]signed certificate/i.test(message)) transport = 'tls_certificate';
  else if (/TLS handshake|SSL handshake|handshake failure/i.test(message)) transport = 'tls_handshake';
  else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /dns error|failed to lookup address|name or service not known/i.test(message)) transport = 'dns';
  else if (code === 'ECONNREFUSED' || /connection refused/i.test(message)) transport = 'connection_refused';
  else if (code === 'ECONNRESET' || /connection reset by peer/i.test(message)) transport = 'connection_reset';
  else if (name === 'TimeoutError' || code === 'ETIMEDOUT' || /connection timed out|operation timed out/i.test(message)) transport = 'timeout';
  else if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || /network is unreachable|no route to host/i.test(message)) transport = 'network_unreachable';
  return { name, ...(code ? { code } : {}), transport };
}

/** Best-effort operator event only. It must never alter the durable completion. */
export function reportSourceCheckFailure(claim: unknown, stage: SourceCheckStage, error: unknown): void {
  try {
    const causes: ExceptionSummary[] = [], seen = new Set<unknown>([error]);
    let cause = field(error, 'cause');
    while (cause !== undefined && cause !== null && causes.length < 2 && !seen.has(cause)) {
      seen.add(cause); causes.push(summarize(cause)); cause = field(cause, 'cause');
    }
    console.error({
      tag: 'RTN_SOURCE_CHECK_DIAGNOSTIC_V1',
      run_id: id(field(claim, 'run_id')), source_id: id(field(field(claim, 'source'), 'id')),
      stage: (STAGES as readonly string[]).includes(stage) ? stage : 'unknown',
      exception: summarize(error), causes,
    });
  } catch { /* Logging failure cannot suppress or retry the original completion. */ }
}
