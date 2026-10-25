/** A syntactic check only. A network worker must also resolve, pin and validate every address and redirect. */
export function parsePublicPublicationUrl(value: string): string {
  if (value !== value.trim() || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error("UNSAFE_PUBLICATION_URL");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("UNSAFE_PUBLICATION_URL"); }
  const host = url.hostname.toLowerCase();
  const forbidden = ["localhost", "local", "internal", "test", "invalid", "example", "onion"];
  if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")
    || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)
    || host.length > 253 || url.href.length > 2048 || forbidden.some(suffix => host === suffix || host.endsWith(`.${suffix}`))
    || [...url.searchParams.keys()].some(key => /(?:token|signature|credential|password|authorization|session|secret|api.?key)/i.test(key))) {
    throw new Error("UNSAFE_PUBLICATION_URL");
  }
  return url.href;
}
