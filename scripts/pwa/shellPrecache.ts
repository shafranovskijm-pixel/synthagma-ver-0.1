import { writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { OutputBundle, OutputChunk } from 'rollup';
import type { Plugin } from 'vite';

type Chunk = OutputChunk & { viteMetadata?: { importedCss: Set<string>; importedAssets: Set<string> } };
type ManifestEntry = { url: string; revision: string | null; size?: number };
const shellFiles = ['index.html', 'favicon.ico', 'pwa-192x192.png', 'pwa-512x512.png', 'sw-private-cache-cleanup.js'];
const publicAsset = /^assets\/[a-zA-Z0-9_./-]+\.(?:js|css|woff2?|png|jpe?g|gif|webp|svg|ico)$/;

export function selectShellGraph(bundle: OutputBundle) {
  const chunks = Object.values(bundle).filter((item): item is Chunk => item.type === 'chunk');
  const entries = chunks.filter(chunk => chunk.isEntry);
  if (!entries.length) throw new Error('PWA shell requires an emitted application entry');
  // main.tsx dynamically loads App, React DOM, the cache check and SW registration.
  // Follow those bootstrap edges once, then only static imports. App's dynamic
  // route tree must remain on demand rather than becoming an install download.
  const roots = new Set(entries.flatMap(chunk => [chunk.fileName, ...chunk.dynamicImports]));
  const required = new Set(shellFiles);
  const selected = new Set<string>();
  const visit = (file: string) => {
    if (selected.has(file)) return;
    const chunk = bundle[file];
    if (!chunk || chunk.type !== 'chunk' || !publicAsset.test(file)) {
      throw new Error(`PWA shell has a missing or unsupported chunk: ${file}`);
    }
    selected.add(file); required.add(file);
    for (const dependency of chunk.imports) visit(dependency);
    const metadata = (chunk as Chunk).viteMetadata;
    for (const asset of [...metadata?.importedCss || [], ...metadata?.importedAssets || []]) {
      if (!publicAsset.test(asset) || !bundle[asset]) throw new Error(`PWA shell has a missing or unsupported asset: ${asset}`);
      required.add(asset);
    }
  };
  for (const root of roots) visit(root);
  return {
    entryFiles: entries.map(chunk => chunk.fileName).sort(),
    bootstrapRootFiles: [...roots].sort(),
    requiredFiles: [...required].sort(),
    chunks: chunks.map(chunk => ({
      file: chunk.fileName, bytes: Buffer.byteLength(chunk.code), isEntry: chunk.isEntry,
      imports: chunk.imports, dynamicImports: chunk.dynamicImports,
      importedCss: [...chunk.viteMetadata?.importedCss || []],
      importedAssets: [...chunk.viteMetadata?.importedAssets || []],
    })).sort((a, b) => a.file.localeCompare(b.file)),
    excludedChunkFiles: chunks.filter(chunk => !selected.has(chunk.fileName)).map(chunk => chunk.fileName).sort(),
  };
}

export function filterShellManifest<T extends ManifestEntry>(entries: T[], graph: ReturnType<typeof selectShellGraph>) {
  const required = new Set(graph.requiredFiles);
  const present = new Set(entries.map(entry => entry.url));
  const missing = graph.requiredFiles.filter(file => !present.has(file));
  // Missing bootstrap/CSS/large files must fail the build, never silently ship
  // an incomplete offline shell or fall back to precaching every application page.
  if (missing.length) throw new Error(`PWA shell manifest is incomplete: ${missing.join(', ')}`);
  return entries.filter(entry => required.has(entry.url));
}

export function createShellPrecache(options: { receiptPath?: string } = {}) {
  if (options.receiptPath && !isAbsolute(options.receiptPath)) throw new Error('PWA shell receipt path must be absolute');
  let graph: ReturnType<typeof selectShellGraph> | undefined;
  const plugin: Plugin = {
    name: 'sintagma-shell-precache', enforce: 'post', apply: 'build',
    generateBundle(_options, bundle) { graph = selectShellGraph(bundle); },
  };
  return {
    plugin,
    manifestTransform: async <T extends ManifestEntry>(entries: T[]) => {
      if (!graph) throw new Error('PWA shell graph was not captured before service worker generation');
      const manifest = filterShellManifest(entries, graph);
      // Optional local evidence only: no diagnostic file is emitted into dist.
      if (options.receiptPath) writeFileSync(options.receiptPath, JSON.stringify({
        schemaVersion: 1, scope: 'Public emitted file graph only; entry plus direct bootstrap dynamic edges and static closure.',
        ...graph, selectedManifest: manifest,
        omittedManifestEntries: entries.filter(entry => !graph!.requiredFiles.includes(entry.url)),
        limits: ['On-demand static cache is bounded; no across-version offline guarantee. Public lesson cache and actor-scoped IndexedDB are unchanged.'],
      }, null, 2) + '\n');
      return { manifest, warnings: [] };
    },
  };
}
