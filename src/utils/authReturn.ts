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
/** Only this fixed catalogue presentation route may survive organization registration. */
export function courseCatalogRegistrationTarget(raw: string | null | undefined): string | null {
  const next = safeInternalNext(raw);
  if (!next) return null;
  const url = new URL(next, 'https://internal.invalid');
  const courseId = url.searchParams.get('catalogCourseId');
  if (url.pathname !== '/organization' || url.hash || [...url.searchParams.keys()].length !== 2
    || url.searchParams.getAll('tab').length !== 1 || url.searchParams.get('tab') !== 'services'
    || url.searchParams.getAll('catalogCourseId').length !== 1 || !courseId
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(courseId)) return null;
  return '/organization?' + new URLSearchParams({ tab: 'services', catalogCourseId: courseId.toLowerCase() });
}
export function organizationRegistrationTarget(params: URLSearchParams): string {
  if (params.get('module') === 'driving-school' || params.get('next') === DRIVING_ORGANIZATION_PATH) return DRIVING_ORGANIZATION_PATH;
  return params.getAll('next').length === 1 ? courseCatalogRegistrationTarget(params.get('next')) ?? '/organization' : '/organization';
}
export function organizationRegistrationHref(params: URLSearchParams): string {
  const target = organizationRegistrationTarget(params);
  if (target === DRIVING_ORGANIZATION_PATH) return '/register-organization?module=driving-school';
  return target === '/organization' ? '/register-organization' : '/register-organization?' + new URLSearchParams({ next: target });
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
