/**
 * Returns the base URL for generating links (login, invites, etc).
 * In production, always returns синтагма.рф (punycode) — sintagma.com.ru
 * is not reachable in RU without VPN.
 */
export const getBaseUrl = (): string => {
  if (import.meta.env.DEV) {
    return window.location.origin;
  }
  // https://синтагма.рф в punycode — работает в РФ без VPN.
  return 'https://xn--80aaiswd0ak.xn--p1ai';
};
