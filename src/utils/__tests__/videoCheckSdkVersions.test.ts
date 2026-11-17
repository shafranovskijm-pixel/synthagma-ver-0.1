// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'public/video-check.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error('Diagnostic inline script is missing');
const video = 'QaVideoSdkVersionCheck01';
const versions = [
  ['latest', 'https://player.kinescope.io/latest/iframe.player.js', '2.202.2'],
  ['v2.202.2', 'https://player.kinescope.io/v2.202.2/iframe.player.js', '2.202.2'],
  ['v2.200.3', 'https://player.kinescope.io/v2.200.3/iframe.player.js', '2.200.3'],
] as const;

class Element {
  value = '';
  disabled = false;
  textContent = '';
  id = '';
  src = '';
  title = '';
  allow = '';
  allowFullscreen = false;
  children: Element[] = [];
  onclick?: () => void | Promise<void>;
  onerror?: () => void;
  onload?: () => void;
  constructor(readonly tagName: string, private readonly requests: string[]) {}
  append(...children: Element[]) {
    this.children.push(...children);
    for (const child of children) {
      if (child.src && ['SCRIPT', 'IFRAME'].includes(child.tagName)) this.requests.push(child.src);
    }
  }
  replaceChildren(...children: Element[]) {
    this.children = [];
    this.append(...children);
  }
  querySelector(selector: string) {
    return this.children.find(child => child.tagName.toLowerCase() === selector) ?? null;
  }
}

function page() {
  const requests: string[] = [];
  const nodes = new Map<string, Element>();
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const id = match[2].match(/\bid="([^"]+)"/)?.[1];
    if (!id) continue;
    const element = new Element(match[1].toUpperCase(), requests);
    element.id = id;
    element.disabled = /\bdisabled\b/.test(match[2]);
    nodes.set(id, element);
  }
  const choices = new Map<string, string[]>();
  for (const match of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const options = [...match[2].matchAll(/<option\b([^>]*)>/g)];
    const values = options.map(option => option[1].match(/\bvalue="([^"]*)"/)![1]);
    choices.set(match[1], values);
    const selected = options.findIndex(option => /\bselected\b/.test(option[1]));
    nodes.get(match[1])!.value = values[Math.max(0, selected)];
  }
  const head = new Element('HEAD', requests);
  const window = {
    addEventListener: vi.fn(),
    onKinescopeIframeAPIReady: undefined as undefined | ((api: ReturnType<typeof factory>) => void),
  };
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const fetch = vi.fn(() => { throw new Error('Unexpected fetch'); });
  runInNewContext(script!, {
    window,
    document: {
      head,
      getElementById: (id: string) => nodes.get(id) ?? null,
      createElement: (tag: string) => new Element(tag.toUpperCase(), requests),
    },
    performance: { now: () => 0 },
    setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch,
    XMLHttpRequest: class { constructor() { throw new Error('Unexpected XHR'); } },
  });
  const node = (id: string) => nodes.get(id)!;
  node('video').value = video;
  return {
    node, choices, requests, head, window, fetch,
    click: (id: string) => Promise.resolve(node(id).onclick!()),
    flush: async () => { await Promise.resolve(); await Promise.resolve(); },
    trace: () => JSON.parse(node('trace').textContent) as Array<{ type: string; data: Record<string, unknown> }>,
  };
}

function factory(version: string) {
  const player = { Events: {}, on: vi.fn(), destroy: vi.fn().mockResolvedValue(undefined) };
  return { version, create: vi.fn(async (_id: string, _options: Record<string, unknown>) => player) };
}

describe('standalone video diagnostic SDK version choice', () => {
  it('exposes only the three approved choices with latest selected by default', () => {
    const p = page();
    expect(p.choices.get('sdk')).toEqual(versions.map(([version]) => version));
    expect(p.node('sdk').value).toBe('latest');
    expect(p.requests).toEqual([]);
  });

  it.each(versions)('loads %s from its literal vendor URL and records the actual version', async (version, url, actual) => {
    const p = page();
    p.node('sdk').value = version;
    const run = p.click('start');
    await p.flush();
    expect(p.requests).toEqual([url]);
    expect(p.node('sdk').disabled).toBe(true);
    expect(p.node('sdk-note').textContent).toContain('перезагрузите страницу');
    const api = factory(actual);
    p.window.onKinescopeIframeAPIReady!(api);
    await run;
    expect(api.create).toHaveBeenCalledOnce();
    expect(api.create.mock.calls[0][1]).toMatchObject({ url: 'https://kinescope.io/embed/' + video });
    expect(p.trace()).toContainEqual(expect.objectContaining({ type: 'sdk-ready', data: { requested: version, version: actual } }));
    expect(p.trace()).toContainEqual(expect.objectContaining({ type: 'connected' }));
    expect(p.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['div', '__proto__'],
    ['div', 'constructor'],
    ['div', 'https://untrusted.example/sdk.js'],
    ['iframe', 'https://untrusted.example/sdk.js'],
    ['plain', 'https://untrusted.example/sdk.js'],
  ])('rejects manipulated choice %s/%s before any resource request', async (mode, value) => {
    const p = page();
    p.node('mode').value = mode;
    p.node('sdk').value = value;
    await p.click('start');
    expect(p.requests).toEqual([]);
    expect(p.head.children).toEqual([]);
    expect(p.trace()).toContainEqual(expect.objectContaining({ type: 'failure', data: expect.objectContaining({ message: 'Неизвестная версия SDK.' }) }));
    expect(p.fetch).not.toHaveBeenCalled();
  });

  it('reuses the loaded version after stop but refuses a different version in the same document', async () => {
    const p = page();
    const first = p.click('start');
    await p.flush();
    const api = factory('2.202.2');
    p.window.onKinescopeIframeAPIReady!(api);
    await first;
    await p.click('stop');
    await p.click('start');
    expect(api.create).toHaveBeenCalledTimes(2);
    await p.click('stop');
    p.node('sdk').value = 'v2.200.3';
    await p.click('start');
    expect(p.requests).toEqual([versions[0][1]]);
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(p.node('sdk').disabled).toBe(true);
    expect(p.trace()).toContainEqual(expect.objectContaining({ type: 'failure', data: expect.objectContaining({ message: 'Для смены версии SDK перезагрузите страницу.' }) }));
  });

  it('keeps the version locked after script failure and stop without another script request', async () => {
    const p = page();
    const first = p.click('start');
    await p.flush();
    expect(p.node('sdk').disabled).toBe(true);
    p.head.children[0].onerror!();
    await first;
    await p.click('stop');
    await p.click('start');
    expect(p.requests).toEqual([versions[0][1]]);
    p.node('sdk').value = 'v2.200.3';
    await p.click('start');
    expect(p.requests).toEqual([versions[0][1]]);
    expect(p.node('sdk').disabled).toBe(true);
    expect(p.trace()).toContainEqual(expect.objectContaining({ type: 'failure', data: expect.objectContaining({ message: 'Для смены версии SDK перезагрузите страницу.' }) }));
  });

  it('rejects an explicit-version mismatch before creating a player', async () => {
    const p = page();
    p.node('sdk').value = 'v2.200.3';
    const run = p.click('start');
    await p.flush();
    const api = factory('2.202.2');
    p.window.onKinescopeIframeAPIReady!(api);
    await run;
    expect(api.create).not.toHaveBeenCalled();
    expect(p.node('sdk').disabled).toBe(true);
    expect(p.trace()).toContainEqual(expect.objectContaining({ type: 'failure', data: expect.objectContaining({ message: expect.stringContaining('SDK version mismatch') }) }));
  });

  it('does not load or lock an SDK for the existing plain iframe mode', async () => {
    const p = page();
    p.node('mode').value = 'plain';
    await p.click('start');
    expect(p.requests).toEqual(['https://kinescope.io/embed/' + video + '?controls=0&keyboard=0']);
    expect(p.head.children).toEqual([]);
    expect(p.node('sdk').disabled).toBe(false);
  });
});
