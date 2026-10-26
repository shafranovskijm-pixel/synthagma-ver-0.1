import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

const ports = vi.hoisted(() => ({ rows: [] as any[], reads: [] as any[] }));
export { ports };
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      if (table !== 'homework_submissions') throw new Error('Unexpected table');
      const filters: Record<string, unknown> = {};
      const query: any = {
        select() { return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        async order() { ports.reads.push({ table, filters: { ...filters } }); return { data: ports.rows, error: null }; },
        insert() { throw new Error('No submission writes in HTML display tests'); },
        update() { throw new Error('No submission updates in HTML display tests'); },
      };
      return query;
    },
  },
}));
vi.mock('@/utils/courseBuilderHelpers', () => ({ uploadToStorage: () => { throw new Error('No file uploads in HTML display tests'); } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
beforeEach(() => {
  ports.rows = []; ports.reads = [];
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network requests forbidden'); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
