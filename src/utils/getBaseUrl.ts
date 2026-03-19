/**
 * Returns the base URL for generating links.
 * In production, always returns the primary domain to ensure
 * all links are consistent regardless of which domain the admin uses.
 */
export const getBaseUrl = (): string => {
  if (import.meta.env.DEV) {
    return window.location.origin;
  }
  return 'https://sintagma.com.ru';
};
