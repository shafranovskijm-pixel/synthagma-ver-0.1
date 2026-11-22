/** SDK requests keep their original Auth/body/options, on one configured origin.
 * This transport cannot retrieve a caller's official/document URL. */
export function createSourceUploadPrivateFetch(
  fetcher: typeof fetch, origin: string, deadlineAt: number, signal: AbortSignal,
  now: () => number = Date.now,
): typeof fetch {
  const allowed = new URL(origin).origin;
  return ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const href = input instanceof Request ? input.url : String(input);
    if (new URL(href).origin !== allowed) return Promise.reject(new Error('RTN_UPLOAD_PRIVATE_ORIGIN'));
    const remaining = Math.min(30_000, deadlineAt - now());
    if (!Number.isFinite(remaining) || remaining <= 0 || signal.aborted) return Promise.reject(new Error('RTN_UPLOAD_DEADLINE'));
    const inherited = 'signal' in init ? init.signal : undefined;
    const signals = [signal, inherited, input instanceof Request ? input.signal : undefined]
      .filter((value): value is AbortSignal => Boolean(value));
    // Capture mutable URL objects once; a genuine SDK Request retains its body.
    return fetcher(input instanceof Request ? input : href, {
      ...init, signal: AbortSignal.any([...signals, AbortSignal.timeout(remaining)]),
    });
  }) as typeof fetch;
}
