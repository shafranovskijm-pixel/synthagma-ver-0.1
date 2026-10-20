// Read an actual completed build only. The generated worker runs in a VM with
// stubbed Workbox registration, no filesystem/network/browser capabilities.
import { readFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { runInNewContext } from 'node:vm';
import { strict as assert } from 'node:assert';

const [distArgument, receiptArgument] = process.argv.slice(2);
assert(distArgument && receiptArgument && process.argv.length === 4, 'Usage: node scripts/pwa/verifyShellPrecache.mjs DIST LOCAL_RECEIPT');
const dist = resolve(distArgument), receipt = JSON.parse(readFileSync(resolve(receiptArgument), 'utf8'));
assert.equal(receipt.schemaVersion, 1);
// Reconstruct the required closure independently from the captured Rollup graph,
// rather than accepting the selector's required-file list as the only authority.
const chunksByFile = new Map(receipt.chunks.map(chunk => [chunk.file, chunk]));
assert.equal(chunksByFile.size, receipt.chunks.length);
const entries = receipt.chunks.filter(chunk => chunk.isEntry);
assert(entries.length > 0);
const roots = new Set(entries.flatMap(chunk => [chunk.file, ...chunk.dynamicImports]));
const expectedFiles = new Set(['index.html', 'favicon.ico', 'pwa-192x192.png', 'pwa-512x512.png', 'sw-private-cache-cleanup.js']);
const queue = [...roots], visited = new Set();
while (queue.length) {
  const name = queue.shift();
  if (visited.has(name)) continue;
  const chunk = chunksByFile.get(name); assert(chunk, `Missing captured graph chunk: ${name}`);
  visited.add(name); expectedFiles.add(name);
  for (const dependency of chunk.imports) queue.push(dependency);
  for (const asset of [...chunk.importedCss, ...chunk.importedAssets]) expectedFiles.add(asset);
}
assert.deepEqual([...roots].sort(), receipt.bootstrapRootFiles);
assert.deepEqual([...expectedFiles].sort(), receipt.requiredFiles);
assert.deepEqual(receipt.chunks.filter(chunk => !visited.has(chunk.file)).map(chunk => chunk.file).sort(), receipt.excludedChunkFiles);
const file = name => {
  const path = resolve(dist, name), rel = relative(dist, path);
  assert(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Build file must be inside dist');
  return path;
};
const routes = [], listeners = new Map(), imports = [];
let manifest;
class Strategy { constructor(options) { this.options = options; this.kind = this.constructor.name; } }
class NetworkOnly extends Strategy {}
class CacheFirst extends Strategy {}
class ExpirationPlugin extends Strategy {}
class CacheableResponsePlugin extends Strategy {}
class NavigationRoute extends Strategy { constructor(handler, options) { super(options); this.handler = handler; } }
const workbox = {
  NetworkOnly, CacheFirst, ExpirationPlugin, CacheableResponsePlugin, NavigationRoute,
  setCacheNameDetails() {}, clientsClaim() {}, cleanupOutdatedCaches() {},
  precacheAndRoute(entries) { assert.equal(manifest, undefined); manifest = entries; },
  createHandlerBoundToURL(url) { return { url }; },
  registerRoute(...args) { routes.push(args); },
};
class WorkerScope {}
const origin = 'https://xn--80aaiswd0ak.xn--p1ai';
const worker = Object.assign(new WorkerScope(), { location: { origin }, skipWaiting() {},
  addEventListener(type, listener) { listeners.set(type, listener); } });
const networkRequests = [];
const context = {
  self: worker, ServiceWorkerGlobalScope: WorkerScope, URL, Request, Response, Headers,
  fetch(request) { networkRequests.push(request); return Promise.resolve(new Response('fresh network')); },
  define(_dependencies, factory) { factory(workbox); },
  importScripts(name) {
    assert.equal(name, 'sw-private-cache-cleanup.js'); imports.push(name);
    runInNewContext(readFileSync(file(name), 'utf8'), context, { timeout: 1000 });
  },
};
worker.define = context.define;
runInNewContext(readFileSync(file('sw.js'), 'utf8'), context, { timeout: 1000 });
assert.deepEqual(imports, ['sw-private-cache-cleanup.js']);
assert(Array.isArray(manifest) && manifest.length > 0);
const actual = new Set(manifest.map(entry => entry.url));
// vite-plugin-pwa adds includeAssets/manifest icons after manifestTransforms.
// The published baseline also repeats these exact three shell entries. Workbox
// stores them in a URL->cache-key Map, but rejects conflicting revisions. Accept
// only the known pairs with identical complete metadata, never arbitrary repeats.
const knownDuplicateShellUrls = new Set(['favicon.ico', 'pwa-192x192.png', 'pwa-512x512.png']);
const duplicateShellEntries = [];
const stableEntry = entry => JSON.stringify(Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])));
for (const url of actual) {
  const copies = manifest.filter(entry => entry.url === url);
  if (copies.length === 1) continue;
  assert(knownDuplicateShellUrls.has(url), `Unexpected duplicate precache URL: ${url}`);
  assert.equal(copies.length, 2, `Expected only one identical shell pair: ${url}`);
  assert(copies.every(entry => Object.keys(entry).every(key => ['url', 'revision', 'integrity'].includes(key))), `Unsupported duplicate metadata: ${url}`);
  assert(copies.every(entry => stableEntry(entry) === stableEntry(copies[0])), `Conflicting duplicate precache metadata: ${url}`);
  assert(typeof copies[0].revision === 'string' && copies[0].revision.length > 0, `Duplicate shell entry must be revisioned: ${url}`);
  assert(receipt.selectedManifest.some(({ size: _buildOnlySize, ...entry }) => entry.url === url && stableEntry(entry) === stableEntry(copies[0])), `Duplicate shell pair differs from selected receipt: ${url}`);
  duplicateShellEntries.push({ url, copies: copies.length, entry: copies[0] });
}
for (const expected of receipt.requiredFiles) assert(actual.has(expected), `Missing shell dependency: ${expected}`);
for (const entry of receipt.selectedManifest) assert.equal(manifest.find(item => item.url === entry.url)?.revision, entry.revision, `Changed shell revision: ${entry.url}`);
const permittedExtra = new Set(['robots.txt', 'manifest.webmanifest', 'favicon.ico', 'pwa-192x192.png', 'pwa-512x512.png']);
for (const name of actual) assert(receipt.requiredFiles.includes(name) || permittedExtra.has(name), `Unexpected install download: ${name}`);
for (const name of receipt.excludedChunkFiles) assert(!actual.has(name), `Lazy chunk was precached: ${name}`);
assert(receipt.excludedChunkFiles.length > 0, 'No lazy application chunks were excluded');
const includedJs = receipt.chunks.filter(chunk => actual.has(chunk.file));
const excludedJs = receipt.chunks.filter(chunk => !actual.has(chunk.file));
assert(excludedJs.some(chunk => chunk.bytes > 100 * 1024), 'Expected at least one substantial lazy chunk/vendor outside install');
const privateRoute = routes.find(([, strategy]) => strategy?.kind === 'NetworkOnly');
const staticRoute = routes.find(([, strategy]) => strategy?.kind === 'CacheFirst' && strategy.options?.cacheName?.endsWith('-static-cache'));
const lessonRoute = routes.find(([, strategy]) => strategy?.options?.cacheName === 'sintagma-public-lessons-v1');
assert(privateRoute && staticRoute && lessonRoute, 'Private/static/public lesson strategies must remain');
assert.equal(staticRoute[1].options.plugins[0].options.maxEntries, 200);
assert.equal(staticRoute[1].options.plugins[0].options.maxAgeSeconds, 7 * 24 * 60 * 60);
assert.equal(lessonRoute[1].options.plugins[0].options.maxAgeSeconds, 30 * 24 * 60 * 60);
const lazyUrl = `${origin}/${receipt.excludedChunkFiles[0]}`;
const request = new Request(lazyUrl);
assert(staticRoute[0]({ url: new URL(lazyUrl), request }), 'Lazy public static must use existing on-demand CacheFirst');
assert(!privateRoute[0]({ url: new URL(lazyUrl), request }));
const guard = listeners.get('fetch'); assert(guard, 'Early private guard must be imported');
for (const privateRequest of [new Request(lazyUrl, { headers: { Authorization: 'Bearer SYNTHETIC' } }), new Request(lazyUrl, { cache: 'no-store' }), new Request(`${origin}/sb-api/rest/v1/profiles`)]) {
  let response, stopped = false;
  guard({ request: privateRequest, respondWith(value) { response = value; }, stopImmediatePropagation() { stopped = true; } });
  assert(stopped && response, 'Private requests must bypass every cache route');
  assert.equal(await (await response).text(), 'fresh network');
}
let publicIntercepted = false;
guard({ request, respondWith() { publicIntercepted = true; }, stopImmediatePropagation() { publicIntercepted = true; } });
assert.equal(publicIntercepted, false);
console.log(JSON.stringify({
  status: 'PASS_ACTUAL_BUILD_GRAPH_MANIFEST_AND_WORKER_REGISTRATION',
  precacheEntries: manifest.length, precacheUniqueUrls: actual.size, knownIdenticalShellDuplicates: duplicateShellEntries,
  precacheBytes: [...actual].reduce((sum, name) => sum + statSync(file(name)).size, 0),
  shellJsChunks: includedJs.length, shellJsBytes: includedJs.reduce((sum, chunk) => sum + chunk.bytes, 0),
  excludedLazyJsChunks: excludedJs.length, excludedLazyJsBytes: excludedJs.reduce((sum, chunk) => sum + chunk.bytes, 0),
  largestExcluded: [...excludedJs].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map(({ file, bytes }) => ({ file, bytes })),
  privateNetworkBypassChecks: networkRequests.length, publicLessonCacheNamePreserved: true,
  limits: ['VM proves emitted registration/matcher/early private guard, not browser cache persistence or actual offline requests.', 'Across-version offline availability remains unproved; existing build refresh purges application caches.'],
}, null, 2));
