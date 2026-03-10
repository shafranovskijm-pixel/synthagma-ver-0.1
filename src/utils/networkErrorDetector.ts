/**
 * Detects network errors caused by antivirus software, VPN, or browser extensions
 * blocking requests to Edge Functions / Supabase endpoints.
 */

const BLOCK_PATTERNS = [
  'failed to fetch',
  'err_blocked_by_client',
  'net::err_blocked_by_client',
  'err_connection_refused',
  'net::err_connection_refused',
  'err_connection_reset',
  'net::err_connection_reset',
  'err_network_changed',
  'err_name_not_resolved',
  'err_internet_disconnected',
  'err_cert_authority_invalid',
  'err_ssl_protocol_error',
  'networkerror',
  'network request failed',
  'load failed',
  'aborted',
];

const SESSION_KEY = 'sintagma_network_block_detected';

export interface NetworkBlockResult {
  blocked: boolean;
  userMessage: string;
  technicalReason: string;
}

/**
 * Analyzes an error to determine if it was caused by security software blocking the request.
 * Only returns `blocked: true` for network-level errors (TypeError, no HTTP status).
 * HTTP errors (4xx, 5xx) are NOT considered blocks.
 */
export function isBlockedBySecuritySoftware(error: unknown): NetworkBlockResult {
  const notBlocked: NetworkBlockResult = {
    blocked: false,
    userMessage: '',
    technicalReason: '',
  };

  if (!error) return notBlocked;

  // HTTP errors from supabase.functions.invoke come as FunctionsHttpError
  // with a context.status — those are NOT blocks
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return notBlocked;
  }

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const name = (error instanceof Error ? error.name : '').toLowerCase();

  // TypeError: Failed to fetch — most common antivirus block signature
  const isTypeError = name === 'typeerror' || error instanceof TypeError;
  const matchesPattern = BLOCK_PATTERNS.some(p => message.includes(p));

  if (isTypeError || matchesPattern) {
    return {
      blocked: true,
      userMessage:
        'Сетевой запрос заблокирован антивирусом, VPN или расширением браузера. ' +
        'Добавьте сайт в исключения антивируса, отключите VPN и перезагрузите страницу.',
      technicalReason: `${name}: ${message}`,
    };
  }

  return notBlocked;
}

/** Mark that a block was detected this session (to avoid duplicate banners). */
export function markBlockDetected(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, Date.now().toString());
  } catch {
    // SSR or private browsing — ignore
  }
}

/** Check if a block was already shown this session. */
export function wasBlockAlreadyShown(): boolean {
  try {
    return !!sessionStorage.getItem(SESSION_KEY);
  } catch {
    return false;
  }
}
