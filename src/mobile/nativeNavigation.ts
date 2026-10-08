/** Preserve ordinary in-app links when Capacitor serves an SPA route directly. */
export function nativeStartupUrl(location: Pick<Location, 'pathname' | 'search' | 'hash'>): string | null {
  if (location.hash) return null;
  const route = location.pathname === '/' || location.pathname === '/index.html'
    ? '/login'
    : location.pathname;
  return `/#${route}${location.search}`;
}
