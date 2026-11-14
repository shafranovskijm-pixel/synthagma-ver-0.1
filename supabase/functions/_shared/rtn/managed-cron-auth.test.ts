// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticateCronRequest } from '../cron-auth';

const current = 'synthetic-managed-current-not-a-real-credential';
const previous = 'synthetic-managed-previous-not-a-real-credential';
function env(values: Record<string, string>) { vi.stubGlobal('Deno', { env: { get: (key: string) => values[key] } }); }
const request = (authorization?: string) => new Request('https://fixture.test/rtn-source-cron', { headers: authorization ? { authorization } : {} });
afterEach(() => vi.unstubAllGlobals());

describe('exact provider generated cron authentication helper', () => {
  it('fails closed if managed authentication is not configured', () => {
    env({});
    expect(authenticateCronRequest(request(`Bearer ${current}`))?.status).toBe(500);
  });
  it('accepts only current or explicitly configured previous opaque tokens', () => {
    env({ LOVABLE_CRON_SECRET: current });
    expect(authenticateCronRequest(request(`Bearer ${current}`))).toBeNull();
    expect(authenticateCronRequest(request(`Bearer ${previous}`))?.status).toBe(401);
    env({ LOVABLE_CRON_SECRET: current, LOVABLE_CRON_SECRET_PREVIOUS: previous });
    expect(authenticateCronRequest(request(`Bearer ${previous}`))).toBeNull();
  });
  it('does not confuse a learner JWT, forged header, malformed token or missing authentication with a schedule', () => {
    env({ LOVABLE_CRON_SECRET: current });
    for (const header of [undefined, 'Bearer synthetic.learner.jwt', `Bearer ${current},extra`, `Basic ${current}`, `Bearer ${current} extra`]) {
      expect(authenticateCronRequest(request(header))?.status).toBe(401);
    }
    expect(authenticateCronRequest(new Request('https://fixture.test/rtn-source-cron', { headers: { 'x-rtn-cron-secret': current } }))?.status).toBe(401);
  });
});
