import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('installed SDK original-bearer dispatch boundary', () => {
  it('a lazy token getter switching to B cannot replace explicitly captured A Authorization', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void; const tokenStarted = new Promise<void>(resolve => { started = resolve; });
    let authorization: string | null = null;
    const client = createClient('https://synthetic.invalid', 'SYNTHETIC_PUBLIC_KEY', {
      accessToken: async () => { started(); await gate; return 'SYNTHETIC_B'; },
      global: { fetch: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        return new Response(JSON.stringify({ id: 'enrollment-a', user_id: 'a', course_id: 'course' }), {status: 200, headers: {'Content-Type': 'application/json'}});
      } },
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    });
    const pending = Promise.resolve(client.from('enrollments').update({progress: 10}).eq('id', 'enrollment-a')
      .select('id,user_id,course_id').setHeader('Authorization', 'Bearer SYNTHETIC_A').maybeSingle());
    await tokenStarted; release(); const result = await pending;
    expect(result.error).toBeNull(); expect(authorization).toBe('Bearer SYNTHETIC_A');
    expect(result.data?.user_id).toBe('a');
  });
});
