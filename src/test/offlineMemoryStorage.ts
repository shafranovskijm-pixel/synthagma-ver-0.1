/** Deterministic async IDB boundary; tests application ownership, not an IDB engine. */
export function offlineMemoryStorage() {
  const stores = new Map<string, Map<string, any>>();
  const versions = new Map<string, number>();
  const keyPaths = new Map<string, string>();
  let readBarrier: (() => Promise<void>) | null = null;
  let openBarrier: (() => Promise<void>) | null = null;
  const rows = (database: string, store: string) => {
    const name = `${database}/${store}`;
    if (!stores.has(name)) stores.set(name, new Map());
    if (!versions.has(database)) versions.set(database, 1);
    return stores.get(name)!;
  };
  const factory = { open(database: string, version?: number) {
    const request: any = { result: null };
    const db: any = {
      objectStoreNames: { contains: (store: string) => stores.has(`${database}/${store}`) },
      createObjectStore: (store: string, options: any) => { rows(database, store); keyPaths.set(`${database}/${store}`, options.keyPath); },
      close() {},
      transaction(store: string) {
        const tx: any = {};
        const items = rows(database, store);
        const finish = () => tx.oncomplete?.(new Event('complete'));
        tx.objectStore = () => ({
          put(value: any) { queueMicrotask(() => { items.set(value[keyPaths.get(`${database}/${store}`) || (store === 'sync_queue' ? 'id' : 'key')], structuredClone(value)); finish(); }); },
          delete(key: string) { queueMicrotask(() => { items.delete(key); finish(); }); },
          get(key: string) {
            const req: any = {};
            queueMicrotask(async () => { if (readBarrier) await readBarrier(); req.result = structuredClone(items.get(key)); req.onsuccess?.(new Event('success')); });
            return req;
          },
          getAll() {
            const req: any = {};
            queueMicrotask(async () => { if (readBarrier) await readBarrier(); req.result = structuredClone([...items.values()]); req.onsuccess?.(new Event('success')); });
            return req;
          },
          openCursor() {
            const req: any = {};
            const keys = [...items.keys()]; let index = 0;
            const step = () => queueMicrotask(() => {
              const key = keys[index++];
              req.result = key === undefined ? null : { value: structuredClone(items.get(key)), delete: () => items.delete(key), continue: step };
              req.onsuccess?.(new Event('success'));
              if (key === undefined) finish();
            });
            step(); return req;
          },
        });
        return tx;
      },
    };
    request.result = db;
    request.transaction = { abort() {} };
    queueMicrotask(async () => {
      if (openBarrier) await openBarrier();
      if (!versions.has(database) || (version && version > versions.get(database)!)) {
        versions.set(database, version || 1); request.onupgradeneeded?.();
      }
      request.onsuccess?.();
    });
    return request;
  } };
  return { factory, rows, holdReads: (barrier: (() => Promise<void>) | null) => { readBarrier = barrier; }, holdOpens: (barrier: (() => Promise<void>) | null) => { openBarrier = barrier; } };
}

export function memoryCacheStorage(seed: Record<string, Record<string, string>> = {}) {
  const rows = new Map<string, Map<string, Response>>(Object.entries(seed).map(([name, entries]) => [name, new Map(Object.entries(entries).map(([url, body]) => [url, new Response(body)]))]));
  const deletedNames: string[] = [];
  const storage: any = {
    keys: async () => [...rows.keys()],
    delete: async (name: string) => { deletedNames.push(name); return rows.delete(name); },
    open: async (name: string) => {
      if (!rows.has(name)) rows.set(name, new Map()); const items = rows.get(name)!;
      return { keys: async () => [...items.keys()].map(url => new Request(url)), match: async (request: Request) => items.get(request.url)?.clone(),
        put: async (request: Request, response: Response) => { items.set(request.url, response.clone()); }, delete: async (request: Request) => items.delete(request.url) };
    },
  };
  return { storage, rows, deletedNames };
}
