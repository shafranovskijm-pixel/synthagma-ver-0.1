/** This function is serialized into the classic worker. Keep every dependency local. */
export function classifyRuntimeRequest(input: {
  url: string; origin: string; authorization?: boolean; noStore?: boolean; credentials?: RequestCredentials;
}): 'private' | 'public-lesson' | 'static' | 'other' {
  try {
    const url = new URL(input.url, input.origin);
    if (input.authorization || input.noStore || input.credentials === 'include' || url.username || url.password) return 'private';
    if (Array.from(url.searchParams.keys()).some(key => /^(?:access_token|refresh_token|token|signature|sig|apikey|authorization|code|password|session|jwt)$/i.test(key))) return 'private';
    const path = decodeURIComponent(url.pathname);
    const backendHost = /(?:^|\.)supabase\.(?:co|in|net)$/.test(url.hostname)
      || /^(?:api|storage|functions)\.(?:sintagma\.com\.ru|xn--80aaiswd0ak\.xn--p1ai)$/.test(url.hostname);
    const publicObject = path.match(/^\/(?:storage\/v1\/|sb-storage\/)?object\/public\/(course-files|demo-assets)\/(.+)$/i);
    // course-files also contains learner homework. A public bucket name is not
    // proof that every object is an anonymous lesson asset.
    const objectPath = publicObject?.[2] || '';
    const publicLesson = !!publicObject && !/(?:^|\/)homework[_/-]/i.test(objectPath)
      && (publicObject[1] === 'demo-assets'
        || /^[0-9a-f-]{36}\/(?:attachments\/[^/]+\/[^/]+|block-images\/[^/]+|documents\/doc_[^/]+|(?:audio_|image_|slide_)[^/]+|cover\.[a-z0-9]+)$/i.test(objectPath)
        || /^(?:tts_[0-9a-f-]+\.(?:ogg|mp3)|audio-\d+\.mp3)$/i.test(objectPath));
    if (publicLesson && (backendHost || url.origin === input.origin) && url.protocol === 'https:' && !url.search
      && (url.origin !== input.origin || input.credentials === 'omit')) return 'public-lesson';
    if (/\/(?:sb-api|sb-functions|sb-storage)(?:\/|$)/i.test(path)
      || /\/(?:rest|auth|functions|storage)\/v1(?:\/|$)/i.test(path)
      || /^\/(?:object|render\/image)\//i.test(path) || backendHost) return 'private';
    if (url.origin === input.origin && !url.search && (
      /^\/assets\/[a-zA-Z0-9_./-]+\.(?:js|css|woff2?|png|jpe?g|gif|webp|svg|ico)$/.test(path)
      || /^\/(?:favicon\.ico|pwa-(?:192x192|512x512)\.png|sw-private-cache-cleanup\.js)$/.test(path)
    )) return 'static';
    if (!url.search && ((url.hostname === 'fonts.gstatic.com' && /\.woff2?$/.test(path))
      || (url.hostname === 'fonts.googleapis.com' && path === '/css2'))) return 'static';
    return 'other';
  } catch { return 'private'; }
}

/** Workbox stringifies callbacks: embed the classifier instead of closing over an import. */
export function runtimeRequestMatcher(kind: ReturnType<typeof classifyRuntimeRequest>) {
  return new Function('context', `const policy = ${classifyRuntimeRequest.toString()};
    return policy({url: context.url.href, origin: self.location.origin,
      authorization: context.request.headers.has('Authorization'),
      credentials: context.request.credentials,
      noStore: context.request.cache === 'no-store' || /no-store/i.test(context.request.headers.get('Cache-Control') || '')}) === ${JSON.stringify(kind)};`) as
    (context: { url: URL; request: Request }) => boolean;
}

/** Shared by browser cleanup and the generated classic SW activation/message handler. */
export async function cleanPrivateRuntimeCaches(
  cacheStorage: CacheStorage, origin: string,
  classify: typeof classifyRuntimeRequest = classifyRuntimeRequest,
  resetShell = false,
): Promise<void> {
  const names = await cacheStorage.keys();
  const publicName = 'sintagma-public-lessons-v1';
  for (const name of names) {
    // Never clear another app's cache or explicit IDB lesson/progress/queue stores.
    if (!/^(?:sintagma-|sigma-)/.test(name)) continue;
    const cache = await cacheStorage.open(name);
    for (const request of await cache.keys()) {
      const key = new URL(request.url, origin);
      const safePrecache = /^sintagma-[\w.-]+-precache-v\d+-/.test(name)
        && key.origin === origin && !request.headers.has('Authorization') && request.cache !== 'no-store' && request.credentials !== 'include'
        && !/no-store/i.test(request.headers.get('Cache-Control') || '')
        && Array.from(key.searchParams.keys()).every(value => value === '__WB_REVISION__')
        && (/^\/(?:index\.html|manifest\.webmanifest|favicon\.ico|pwa-(?:192x192|512x512)\.png|sw-private-cache-cleanup\.js)$/.test(key.pathname)
          || /^\/assets\/[a-zA-Z0-9_./-]+\.(?:js|css|woff2?|png|jpe?g|gif|webp|svg|ico)$/.test(key.pathname));
      if (safePrecache && !resetShell) continue;
      const kind = classify({ url: request.url, origin, authorization: request.headers.has('Authorization'),
        credentials: request.credentials,
        noStore: request.cache === 'no-store' || /no-store/i.test(request.headers.get('Cache-Control') || '') });
      if (name !== publicName && (resetShell || /-api-cache$/.test(name))) {
        if (kind === 'public-lesson') {
          const response = await cache.match(request);
          if (response) await (await cacheStorage.open(publicName)).put(request, response);
        }
        await cache.delete(request);
      } else if (kind !== 'static' && kind !== 'public-lesson') {
        await cache.delete(request);
      }
    }
    if (name !== publicName && (resetShell || /-api-cache$/.test(name))) await cacheStorage.delete(name);
  }
}

export function privateCleanupWorkerSource(): string {
  return `/* UC private runtime-cache cleanup. No IndexedDB or lesson-asset purge. */
const classifyRuntimeRequest = ${classifyRuntimeRequest.toString()};
const cleanPrivateRuntimeCaches = ${cleanPrivateRuntimeCaches.toString()};
const cleanup = (resetShell = false) => cleanPrivateRuntimeCaches(self.caches, self.location.origin, classifyRuntimeRequest, resetShell);
self.__sintagmaPrivateRuntimeCleanup = cleanup;
if (typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope) {
  // importScripts runs before Workbox precache/navigation registration. Their
  // static URL matches must not precede an explicit private request boundary.
  self.addEventListener('fetch', event => {
    const request = event.request;
    const input = {url: request.url, origin: self.location.origin,
      authorization: request.headers.has('Authorization'), credentials: request.credentials,
      noStore: request.cache === 'no-store' || /no-store/i.test(request.headers.get('Cache-Control') || '')};
    if (classifyRuntimeRequest(input) !== 'private') return;
    // Browser navigation normally includes cookies. Only an ordinary same-app
    // shell URL may keep its existing offline navigation route; explicit
    // credentials on assets/lessons and private headers/URLs still use network.
    const url = new URL(request.url);
    if (request.mode === 'navigate' && url.origin === self.location.origin && !url.search
      && classifyRuntimeRequest({...input, credentials: 'same-origin'}) === 'other') return;
    event.respondWith(fetch(request));
    event.stopImmediatePropagation();
  });
  self.addEventListener('activate', event => event.waitUntil(cleanup()));
  self.addEventListener('message', event => {
    if (event.data?.type !== 'SINTAGMA_CLEAN_PRIVATE_RUNTIME_CACHES') return;
    const task = cleanup().then(() => event.ports?.[0]?.postMessage({ok:true, policyVersion:2}));
    event.waitUntil(task);
  });
}
`;
}
