import { describe, expect, it, vi } from 'vitest';
import { classifyRuntimeRequest, runtimeRequestMatcher, cleanPrivateRuntimeCaches, privateCleanupWorkerSource } from './privateCachePolicy';
import { memoryCacheStorage } from '@/test/offlineMemoryStorage';

const origin = 'https://xn--80aaiswd0ak.xn--p1ai';
describe('private runtime cache policy', () => {
  it.each([
    'https://project.supabase.co/rest/v1/student_frdo_data',
    `${origin}/sb-api/rest/v1/profiles`,
    'https://api.xn--80aaiswd0ak.xn--p1ai/sb-functions/ocr-snils',
    `${origin}/sb-storage/object/authenticated/student-documents/test.png`,
    'https://project.supabase.co/storage/v1/object/public/student-documents/id.png',
    `${origin}/assets/secret.js?token=synthetic`,
    `${origin}/sb-api/rest/v1/profile.png`,
    `${origin}/object/sign/student-documents/test.svg?%74oken=synthetic`,
  ])('never caches private direct/proxy/secret URL %s', url => expect(classifyRuntimeRequest({url, origin})).toBe('private'));
  it('permits only anonymous known public lesson locations, including proxy; rejects path suffix forgery and credential variants', () => {
    const url = 'https://project.supabase.co/storage/v1/object/public/course-files/11111111-1111-4111-8111-111111111111/attachments/lesson/public.mp4';
    expect(classifyRuntimeRequest({url, origin})).toBe('public-lesson');
    expect(classifyRuntimeRequest({url, origin, authorization: true})).toBe('private');
    expect(classifyRuntimeRequest({url, origin, credentials: 'include'})).toBe('private');
    expect(classifyRuntimeRequest({url, origin, noStore: true})).toBe('private');
    expect(classifyRuntimeRequest({url: `${origin}/sb-storage/object/public/demo-assets/demo.png`, origin, credentials: 'omit'})).toBe('public-lesson');
    expect(classifyRuntimeRequest({url: `${origin}/sb-storage/object/public/demo-assets/demo.png`, origin, credentials: 'same-origin'})).toBe('private');
    expect(classifyRuntimeRequest({url: 'https://untrusted.example/object/public/course-files/a.png', origin})).toBe('private');
    expect(classifyRuntimeRequest({url: `${origin}/private/object/public/course-files/a.png`, origin})).toBe('other');
    expect(classifyRuntimeRequest({url: 'https://project.supabase.co/storage/v1/object/public/course-files/11111111-1111-4111-8111-111111111111/homework_lesson_123.png', origin})).toBe('private');
    expect(classifyRuntimeRequest({url: 'https://project.supabase.co/storage/v1/object/public/course-files/arbitrary/identity.png', origin})).toBe('private');
  });
  it('serialized matcher and classic worker have no imported app closure', async () => {
    const match = runtimeRequestMatcher('private');
    vi.stubGlobal('self', { location: { origin } });
    expect(match({ url: new URL(`${origin}/sb-api/rest/v1/profiles`), request: new Request(`${origin}/sb-api/rest/v1/profiles`) })).toBe(true);
    const events = new Map<string, any>();
    class WorkerScope {}
    const worker = Object.assign(new WorkerScope(), { location: { origin }, caches: { keys: async () => [] }, addEventListener: (name: string, fn: any) => events.set(name, fn) });
    new Function('self', 'ServiceWorkerGlobalScope', privateCleanupWorkerSource())(worker, WorkerScope);
    let task!: Promise<void>; events.get('activate')({waitUntil: (value: Promise<void>) => { task = value; }}); await task;
    expect(events.has('message')).toBe(true);
    vi.unstubAllGlobals();
  });
  it('removes unknown/private app entries, migrates public lesson bytes and preserves unrelated caches on refresh', async () => {
    const lesson = 'https://project.supabase.co/storage/v1/object/public/course-files/11111111-1111-4111-8111-111111111111/attachments/lesson/public.png';
    const rows = new Map<string, Map<string, Response>>([
      ['sintagma-1.0.81-api-cache', new Map([[`${origin}/sb-api/rest/v1/profiles`, new Response('private')], [lesson, new Response('public sentinel')]])],
      ['sintagma-1.0.81-images-cache', new Map([[`${origin}/unknown/id.png`, new Response('private')]])],
      ['sintagma-1.0.81-static-cache', new Map([[`${origin}/assets/app.js`, new Response('public shell')]])],
      ['other-app', new Map([[`${origin}/unknown`, new Response('unrelated')]])],
    ]);
    const storage: any = {
      keys: async () => [...rows.keys()], delete: async (name: string) => rows.delete(name),
      open: async (name: string) => {
        if (!rows.has(name)) rows.set(name, new Map()); const items = rows.get(name)!;
        return { keys: async () => [...items.keys()].map(url => new Request(url)), match: async (request: Request) => items.get(request.url)?.clone(),
          put: async (request: Request, response: Response) => { items.set(request.url, response.clone()); }, delete: async (request: Request) => items.delete(request.url) };
      },
    };
    await cleanPrivateRuntimeCaches(storage, origin, undefined, true);
    expect([...rows.keys()].sort()).toEqual(['other-app', 'sintagma-public-lessons-v1']);
    expect(await rows.get('sintagma-public-lessons-v1')!.get(lesson)!.text()).toBe('public sentinel');
    await cleanPrivateRuntimeCaches(storage, origin);
    expect(rows.get('sintagma-public-lessons-v1')!.has(lesson)).toBe(true);
  });
  it('classic import guards private asset/navigation requests before Workbox URL-only precache matches', async () => {
    const events = new Map<string, any>();
    class WorkerScope {}
    const worker = Object.assign(new WorkerScope(), {location: {origin}, addEventListener: (name: string, fn: any) => events.set(name, fn)});
    const network = vi.fn(async () => new Response('fresh private request'));
    new Function('self', 'ServiceWorkerGlobalScope', 'fetch', privateCleanupWorkerSource())(worker, WorkerScope, network);
    for (const request of [
      new Request(`${origin}/assets/bundled.js`, {headers: {Authorization: 'Bearer SYNTHETIC'}}),
      new Request(`${origin}/assets/bundled.js`, {cache: 'no-store'}),
      new Request(`${origin}/student`, {headers: {Authorization: 'Bearer SYNTHETIC'}}),
      new Request(`${origin}/student`, {cache: 'no-store'}),
    ]) {
      const stopImmediatePropagation = vi.fn(); let result!: Promise<Response>;
      events.get('fetch')({request, respondWith: (value: Promise<Response>) => {result = value;}, stopImmediatePropagation});
      expect(network).toHaveBeenLastCalledWith(request); expect(stopImmediatePropagation).toHaveBeenCalledOnce();
      expect(await (await result).text()).toBe('fresh private request');
    }
    const respondWith = vi.fn(); const stop = vi.fn();
    events.get('fetch')({request: new Request(`${origin}/assets/bundled.js`), respondWith, stopImmediatePropagation: stop});
    expect(respondWith).not.toHaveBeenCalled(); expect(stop).not.toHaveBeenCalled();
    const navigation = {url: `${origin}/student`, headers: new Headers(), cache: 'default', credentials: 'include', mode: 'navigate'};
    events.get('fetch')({request: navigation, respondWith, stopImmediatePropagation: stop});
    expect(respondWith).not.toHaveBeenCalled(); expect(stop).not.toHaveBeenCalled();
    for (const extra of [{headers: new Headers({Authorization: 'Bearer SYNTHETIC'})}, {cache: 'no-store'}, {url: `${origin}/sb-api/rest/v1/profiles`}]) {
      const respond = vi.fn(); const stopPrivate = vi.fn();
      events.get('fetch')({request: {...navigation, ...extra}, respondWith: respond, stopImmediatePropagation: stopPrivate});
      expect(respond).toHaveBeenCalledOnce(); expect(stopPrivate).toHaveBeenCalledOnce();
    }
  });
  it('normal activation preserves revisioned precached offline shell while rejecting secret/private lookalikes', async () => {
    const name = 'sintagma-1.0.82-precache-v2-https://app/';
    const shell = `${origin}/index.html?__WB_REVISION__=synthetic-hash`;
    const fake = `${origin}/index.html?__WB_REVISION__=synthetic&token=private`;
    const {storage, rows} = memoryCacheStorage({[name]: {[shell]: 'offline shell', [fake]: 'secret', [`${origin}/sb-api/rest/v1/private?__WB_REVISION__=hash`]: 'private'}});
    await cleanPrivateRuntimeCaches(storage, origin);
    expect([...rows.get(name)!.keys()]).toEqual([shell]);
  });
});
