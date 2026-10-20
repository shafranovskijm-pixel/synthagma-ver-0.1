import { describe, expect, it } from 'vitest';
import type { OutputBundle } from 'rollup';
import { createShellPrecache, filterShellManifest, selectShellGraph } from './shellPrecache';

const chunk = (fileName: string, imports: string[] = [], dynamicImports: string[] = [], isEntry = false, css: string[] = [], assets: string[] = []) => ({
  type: 'chunk', fileName, imports, dynamicImports, isEntry, code: '// synthetic public code',
  viteMetadata: { importedCss: new Set(css), importedAssets: new Set(assets) },
});
const fixture = () => ({
  'assets/main.js': chunk('assets/main.js', ['assets/core.js'], ['assets/App.js', 'assets/client.js', 'assets/register.js', 'assets/cacheCheck.js'], true, ['assets/main.css']),
  'assets/App.js': chunk('assets/App.js', ['assets/core.js', 'assets/ui.js'], ['assets/CourseEditor.js', 'assets/StudentDashboard.js'], false, ['assets/app.css'], ['assets/logo.svg']),
  'assets/core.js': chunk('assets/core.js', ['assets/ui.js']),
  'assets/ui.js': chunk('assets/ui.js', ['assets/core.js']),
  'assets/client.js': chunk('assets/client.js', ['assets/core.js']),
  'assets/register.js': chunk('assets/register.js', ['assets/workbox-window.js']),
  'assets/workbox-window.js': chunk('assets/workbox-window.js'),
  'assets/cacheCheck.js': chunk('assets/cacheCheck.js'),
  'assets/CourseEditor.js': chunk('assets/CourseEditor.js', ['assets/heavy-pdf.js']),
  'assets/heavy-pdf.js': chunk('assets/heavy-pdf.js'),
  'assets/StudentDashboard.js': chunk('assets/StudentDashboard.js'),
  'assets/main.css': { type: 'asset', fileName: 'assets/main.css', source: 'body{}' },
  'assets/app.css': { type: 'asset', fileName: 'assets/app.css', source: '.app{}' },
  'assets/logo.svg': { type: 'asset', fileName: 'assets/logo.svg', source: '<svg/>' },
} as unknown as OutputBundle);

describe('PWA shell precache selection', () => {
  it('retains every bootstrap root and static/CSS/asset dependency but excludes lazy route subtrees and their heavy vendor', () => {
    const graph = selectShellGraph(fixture());
    expect(graph.bootstrapRootFiles).toEqual(['assets/App.js', 'assets/cacheCheck.js', 'assets/client.js', 'assets/main.js', 'assets/register.js']);
    expect(graph.requiredFiles).toEqual([
      'assets/App.js', 'assets/app.css', 'assets/cacheCheck.js', 'assets/client.js', 'assets/core.js',
      'assets/logo.svg', 'assets/main.css', 'assets/main.js', 'assets/register.js', 'assets/ui.js', 'assets/workbox-window.js',
      'favicon.ico', 'index.html', 'pwa-192x192.png', 'pwa-512x512.png', 'sw-private-cache-cleanup.js',
    ]);
    expect(graph.excludedChunkFiles).toEqual(['assets/CourseEditor.js', 'assets/StudentDashboard.js', 'assets/heavy-pdf.js']);
  });
  it('does not omit a shared dependency simply because a lazy page also imports it', () => {
    const bundle = fixture(); (bundle['assets/CourseEditor.js'] as any).imports.push('assets/ui.js');
    expect(selectShellGraph(bundle).requiredFiles).toContain('assets/ui.js');
  });
  it('fails closed on absent entry, bootstrap dependency, static dependency or imported asset', () => {
    for (const name of ['assets/main.js', 'assets/App.js', 'assets/ui.js', 'assets/main.css', 'assets/logo.svg']) {
      const bundle = fixture(); delete bundle[name];
      expect(() => selectShellGraph(bundle)).toThrow(/PWA shell/);
    }
  });
  it('filters actual manifest objects without changing revision or integrity and rejects an incomplete shell', () => {
    const graph = selectShellGraph(fixture());
    const entries = [...graph.requiredFiles, ...graph.excludedChunkFiles].map(url => ({ url, revision: 'synthetic-revision', integrity: 'synthetic-integrity', size: 123 }));
    const selected = filterShellManifest(entries, graph);
    expect(selected.map(entry => entry.url)).toEqual(graph.requiredFiles);
    expect(selected.every(entry => entries.includes(entry))).toBe(true);
    expect(entries).toHaveLength(graph.requiredFiles.length + graph.excludedChunkFiles.length);
    expect(() => filterShellManifest(entries.filter(entry => entry.url !== 'assets/client.js'), graph)).toThrow('assets/client.js');
  });
  it('requires graph capture before the Workbox transform and never emits a public receipt', async () => {
    const selector = createShellPrecache();
    await expect(selector.manifestTransform([])).rejects.toThrow('not captured');
    const hook = selector.plugin.generateBundle as Function;
    hook.call({}, {}, fixture());
    const graph = selectShellGraph(fixture());
    const result = await selector.manifestTransform(graph.requiredFiles.map(url => ({ url, revision: null })));
    expect(result.manifest).toHaveLength(graph.requiredFiles.length);
    expect(result.warnings).toEqual([]);
    expect(() => createShellPrecache({ receiptPath: 'relative/receipt.json' })).toThrow('absolute');
  });
});
