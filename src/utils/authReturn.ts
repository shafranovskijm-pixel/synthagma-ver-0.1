/** Only a same-origin route can survive the common login flow. */
export function safeInternalNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
    const base = 'https://internal.invalid';
    const url = new URL(raw, base);
    if (url.pathname.startsWith('//') || decodeURIComponent(url.pathname).startsWith('//') || url.origin !== base || /^\/(login|register|register-organization)(\/|$)/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export const DRIVING_ORGANIZATION_PATH = '/organization/driving-school';
export function organizationRegistrationTarget(params: URLSearchParams): string {
  return params.get('module') === 'driving-school' || params.get('next') === DRIVING_ORGANIZATION_PATH
    ? DRIVING_ORGANIZATION_PATH : '/organization';
}
export function loginWithNext(path: string | null | undefined): string {
  const next = safeInternalNext(path);
  return next ? '/login?next=' + encodeURIComponent(next) : '/login';
}

export function isDrivingInvitationTarget(raw: string | null): boolean {
  const next = safeInternalNext(raw);
  if (!next) return false;
  const url = new URL(next, 'https://internal.invalid');
  return url.pathname === '/driving-school' && !!url.searchParams.get('invite');
}
