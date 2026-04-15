const REF_COOKIE_KEY = 'ref_code';
const PARTNER_REF_COOKIE_KEY = 'partner_ref';
const REF_COOKIE_DAYS = 90;

export function saveRefCode(code: string) {
  const expires = new Date();
  expires.setDate(expires.getDate() + REF_COOKIE_DAYS);
  document.cookie = `${REF_COOKIE_KEY}=${encodeURIComponent(code)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

export function getRefCode(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${REF_COOKIE_KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearRefCode() {
  document.cookie = `${REF_COOKIE_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
}

export function savePartnerRef(code: string) {
  const expires = new Date();
  expires.setDate(expires.getDate() + REF_COOKIE_DAYS);
  document.cookie = `${PARTNER_REF_COOKIE_KEY}=${encodeURIComponent(code)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

export function getPartnerRef(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${PARTNER_REF_COOKIE_KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearPartnerRef() {
  document.cookie = `${PARTNER_REF_COOKIE_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
}

/** Call on app init — reads ?ref= from URL and stores in cookie */
export function captureRefFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    saveRefCode(ref);
  }
  const partnerRef = params.get('partner_ref');
  if (partnerRef) {
    savePartnerRef(partnerRef);
  }
}
