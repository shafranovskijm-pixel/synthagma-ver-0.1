import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

const ports = vi.hoisted(() => ({ auth: {} as any, rpc: vi.fn(), completed: 0 }));
export { ports };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ports.auth }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc(name: string, args: unknown) {
      return { abortSignal: async (signal: AbortSignal) => {
        try { return await ports.rpc(name, args, signal); }
        finally { ports.completed += 1; }
      } };
    },
  },
}));
beforeEach(() => {
  ports.auth = {}; ports.rpc.mockReset(); ports.completed = 0;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('TextEncoder', TextEncoder);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live network forbidden'); }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
