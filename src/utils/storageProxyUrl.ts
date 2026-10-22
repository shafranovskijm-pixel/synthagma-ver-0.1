/** Shared with proxyFetch: this is the platform storage proxy, never an arbitrary image host. */
export const STORAGE_PROXY_BASE_URL = 'https://api.xn--80aaiswd0ak.xn--p1ai';
export const STORAGE_PROXY_PREFIX = '/sb-storage';
/** Pure URL check: no fetch, access probe, cookies, bearer token or proxy-mode mutation. */
export function isOwnStorageProxyImageUrl(value: string): boolean {
    try {
        const url = new URL(value), base = new URL(STORAGE_PROXY_BASE_URL);
        return url.protocol === 'https:' && url.origin === base.origin && !url.username && !url.password
            && [STORAGE_PROXY_PREFIX + '/object/sign/', STORAGE_PROXY_PREFIX + '/object/public/'].some(prefix => url.pathname.startsWith(prefix) && url.pathname.length > prefix.length);
    }
    catch {
        return false;
    }
}
