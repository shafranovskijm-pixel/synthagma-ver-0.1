const REF_COOKIE_KEY = 'ref_code';
const PARTNER_REF_COOKIE_KEY = 'partner_ref';
const REF_LS_KEY = 'lvbl_ref_code';
const PARTNER_REF_LS_KEY = 'lvbl_partner_ref';
const REF_COOKIE_DAYS = 90;

function safeLS(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; }
  catch { return null; }
}

function setCookie(name: string, value: string) {
  try {
    const expires = new Date();
    expires.setDate(expires.getDate() + REF_COOKIE_DAYS);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
  } catch { /* ignore */ }
}

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch { return null; }
}

function clearCookie(name: string) {
  try {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
  } catch { /* ignore */ }
}

/** First-touch: do NOT overwrite if already set within the 90-day window. */
export function saveRefCode(code: string) {
  if (getRefCode()) return; // first-touch
  setCookie(REF_COOKIE_KEY, code);
  const ls = safeLS();
  if (ls) {
    try { ls.setItem(REF_LS_KEY, JSON.stringify({ code, ts: Date.now() })); } catch { /* ignore */ }
  }
}

export function getRefCode(): string | null {
  const cookie = readCookie(REF_COOKIE_KEY);
  if (cookie) return cookie;
  const ls = safeLS();
  if (!ls) return null;
  try {
    const raw = ls.getItem(REF_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: string; ts?: number };
    if (!parsed.code || !parsed.ts) return null;
    const ageDays = (Date.now() - parsed.ts) / (1000 * 60 * 60 * 24);
    if (ageDays > REF_COOKIE_DAYS) {
      ls.removeItem(REF_LS_KEY);
      return null;
    }
    return parsed.code;
  } catch { return null; }
}

export function clearRefCode() {
  clearCookie(REF_COOKIE_KEY);
  const ls = safeLS();
  if (ls) { try { ls.removeItem(REF_LS_KEY); } catch { /* ignore */ } }
}

export function savePartnerRef(code: string) {
  if (getPartnerRef()) return; // first-touch
  setCookie(PARTNER_REF_COOKIE_KEY, code);
  const ls = safeLS();
  if (ls) {
    try { ls.setItem(PARTNER_REF_LS_KEY, JSON.stringify({ code, ts: Date.now() })); } catch { /* ignore */ }
  }
}

export function getPartnerRef(): string | null {
  const cookie = readCookie(PARTNER_REF_COOKIE_KEY);
  if (cookie) return cookie;
  const ls = safeLS();
  if (!ls) return null;
  try {
    const raw = ls.getItem(PARTNER_REF_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: string; ts?: number };
    if (!parsed.code || !parsed.ts) return null;
    const ageDays = (Date.now() - parsed.ts) / (1000 * 60 * 60 * 24);
    if (ageDays > REF_COOKIE_DAYS) {
      ls.removeItem(PARTNER_REF_LS_KEY);
      return null;
    }
    return parsed.code;
  } catch { return null; }
}

export function clearPartnerRef() {
  clearCookie(PARTNER_REF_COOKIE_KEY);
  const ls = safeLS();
  if (ls) { try { ls.removeItem(PARTNER_REF_LS_KEY); } catch { /* ignore */ } }
}

/**
 * Parse `?ref=` and `?partner_ref=` from both `location.search` and `location.hash`.
 * HashRouter (Capacitor native build) puts query params after `#/path?ref=...`,
 * so `location.search` is empty and we MUST inspect the hash too.
 */
function extractParams(): URLSearchParams {
  const combined = new URLSearchParams();
  try {
    const search = new URLSearchParams(window.location.search);
    search.forEach((v, k) => combined.set(k, v));
  } catch { /* ignore */ }
  try {
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx >= 0) {
      const hashQuery = new URLSearchParams(hash.slice(qIdx + 1));
      hashQuery.forEach((v, k) => { if (!combined.has(k)) combined.set(k, v); });
    }
  } catch { /* ignore */ }
  return combined;
}

/** Call on app init — captures ref codes from URL (search OR hash). */
export function captureRefFromUrl() {
  if (typeof window === 'undefined') return;
  const params = extractParams();
  const ref = params.get('ref');
  if (ref) saveRefCode(ref);
  const partnerRef = params.get('partner_ref');
  if (partnerRef) savePartnerRef(partnerRef);
}
