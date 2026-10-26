import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Public catalogue reads must not inherit the signed-in visitor's permissions.
// Resolve fetch at request time, retaining main.tsx's proxy and runtime wrappers.
export const publicCatalogClient = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sintagma-public-course-catalog',
    },
    global: {
      headers: { Authorization: 'Bearer ' + import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      fetch: (input, init) => globalThis.fetch(input, init),
    },
  },
);
