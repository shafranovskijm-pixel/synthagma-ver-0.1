import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transpileModule, ScriptTarget, JsxEmit } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createApplicationUpdateCoordinator } from '../applicationUpdatePrompt';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const cacheBootstrap = html.match(/<!-- Cache\/SW bootstrap[\s\S]*?<script>([\s\S]*?)<\/script>/)![1];
const recovery = html.match(/<!-- SW recovery[\s\S]*?<script>([\s\S]*?)<\/script>/)![1];

function page() {
  const timers: Array<() => void> = [];
  const reload = vi.fn(); const unregister = vi.fn();
  const root = document.createElement('div');
  const context: any = {
    URL, location: { hostname: 'example.test', reload },
    localStorage: { getItem: (key: string) => key === '__asset_id' ? '/assets/old.js' : null, setItem: vi.fn() },
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; },
    clearTimeout: vi.fn(), setInterval: vi.fn(), addEventListener: vi.fn(),
    MutationObserver: class { observe() {} disconnect() {} },
    navigator: { serviceWorker: { getRegistrations: vi.fn(async () => [{ unregister }]) } },
    document: {
      getElementById: () => root, createElement: (tag: string) => document.createElement(tag),
      querySelectorAll: () => [], addEventListener: vi.fn(),
      querySelector: () => ({ getAttribute: () => '/assets/new.js' }), body: document.body,
    },
  };
  context.window = context;
  return { context, root, timers, reload, unregister };
}

describe('release bootstrap does not erase an open form', () => {
  it('asset mismatch only records a non-sensitive hint; no async purge/unregister/reload', async () => {
    const p = page(); p.root.innerHTML = '<input value="unsaved TEST"><input type="checkbox" checked>';
    runInNewContext(cacheBootstrap, p.context);
    await Promise.resolve();
    expect(p.context.__sintagmaApplicationUpdatePending).toBe(true);
    expect(p.reload).not.toHaveBeenCalled(); expect(p.unregister).not.toHaveBeenCalled();
    expect(p.context.navigator.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(p.root.querySelector('input')!.value).toBe('unsaved TEST');
    expect(p.root.querySelector('input[type=checkbox]')).toHaveProperty('checked', true);
  });
  it('an 8s timer rechecks current content and does not touch a form mounted later', () => {
    const p = page(); runInNewContext(recovery, p.context);
    p.root.innerHTML = '<form><input value="late unsaved TEST"></form>';
    p.timers[0]();
    expect(p.root.querySelector('input')!.value).toBe('late unsaved TEST');
    expect(p.root.querySelector('button')).toBeNull();
    expect(p.reload).not.toHaveBeenCalled(); expect(p.unregister).not.toHaveBeenCalled();
  });
  it('a truly blank startup offers an accessible explicit retry without cleanup or reload', () => {
    const p = page(); runInNewContext(recovery, p.context); p.timers[0]();
    expect(p.root.querySelector('[role=status]')).not.toBeNull();
    const button = p.root.querySelector('button')!;
    expect(button.textContent).toBe('Обновить страницу');
    expect(p.reload).not.toHaveBeenCalled(); expect(p.unregister).not.toHaveBeenCalled();
    button.click(); expect(p.reload).toHaveBeenCalledTimes(1);
  });
  it('uses prompt workers without automatic claim/activation; private policy and guarded startup remain wired', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    expect(config).toContain('registerType: "prompt"');
    expect(config).toContain('skipWaiting: false'); expect(config).toContain('clientsClaim: false');
    expect(config).toContain("importScripts: ['sw-private-cache-cleanup.js']");
    expect(config).toMatch(/urlPattern: runtimeRequestMatcher\('private'\),\s+handler: "NetworkOnly"/);
    expect(main).not.toContain('virtual:pwa-register');
    expect(main).toContain('if (privatePolicyRequired) installPrivateRuntimeFetchFence();');
    expect(main).toContain('if (privatePolicyRequired) await startAfterPrivateRuntimePolicy(prepare, start);');
    expect(main).toContain('applicationUpdates.markReady()');
  });
  it.each([false, true])('a failed private-policy gate offers exact-worker manual startup recovery without App (legacy entry: %s)', async legacyEntry => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    const executable = transpileModule(main.slice(main.indexOf('const privatePolicyReady ='))
      .split('import.meta.env.PROD').join('true'), { fileName: 'main.tsx', compilerOptions: { target: ScriptTarget.ES2022, jsx: JsxEmit.React } }).outputText
      .replace(/\nexport \{\};?\s*$/, '');
    const old = {}; const first = {}; const replacement = {};
    let waiting: object | null = first; let active: object | null = old;
    let presenter: ((value: { failed: boolean; update: () => void }) => void) | undefined;
    const reload = vi.fn(); const skip = vi.fn(); const appImported = vi.fn();
    const coordinator = createApplicationUpdateCoordinator({
      waiting: () => waiting, active: () => active, reload, skipWaiting: skip,
      notice: value => presenter?.(value), later: () => 1, cancel: vi.fn(),
    });
    class PolicyError extends Error { constructor(readonly code: string) { super(code); } }
    const failure = new PolicyError('POLICY_MISMATCH');
    const root = document.createElement('div');
    const register = vi.fn(async () => { coordinator.available(first); });
    const context: any = {
      privatePolicyRequired: true, isNative: false, isPreview: false, currentVersion: 'TEST',
      __sintagmaLegacyLoginEntry: legacyEntry,
      ensurePrivateRuntimePolicy: vi.fn(async () => { throw failure; }),
      startAfterPrivateRuntimePolicy: vi.fn(async () => { throw failure; }),
      clearPrivateRuntimeCaches: vi.fn(), PrivateRuntimePolicyError: PolicyError,
      applicationUpdates: coordinator, registerApplicationWorker: register,
      presentApplicationRecoveryUpdates: (callback: typeof presenter) => {
        presenter = callback; coordinator.markReady(); coordinator.available();
      },
      document: { getElementById: () => root, createElement: (tag: string) => document.createElement(tag) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn() }, console: { warn: vi.fn() },
    };
    context.window = context;
    runInNewContext(executable, context, { importModuleDynamically: () => { appImported(); throw failure; } });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(register).toHaveBeenCalledTimes(1);
    expect(appImported).not.toHaveBeenCalled();
    expect(context.localStorage.getItem).not.toHaveBeenCalled();
    const retry = root.querySelector('button')!;
    expect(retry.textContent).toBe('Обновить страницу');
    expect(root.textContent).toContain('POLICY_MISMATCH');
    expect(skip).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
    // A stale visible button is not authorization to activate a newer worker.
    waiting = replacement; retry.click();
    expect(skip).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
    retry.click(); expect(skip).toHaveBeenCalledExactlyOnceWith(replacement);
    active = replacement; coordinator.activated(replacement);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(appImported).not.toHaveBeenCalled();
  });
});
