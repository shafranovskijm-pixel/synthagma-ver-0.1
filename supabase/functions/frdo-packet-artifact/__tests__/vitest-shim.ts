// Typecheck-only shim so `deno check` can resolve the vitest specifiers used by
// the reviewed UC020 test sources. The real test run uses vitest itself; these
// exports are never executed by the deployed edge function.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const describe: any = () => undefined;
export const it: any = () => undefined;
export const expect: any = () => undefined;
export const beforeAll: any = () => undefined;
export const afterAll: any = () => undefined;
export const beforeEach: any = () => undefined;
export const afterEach: any = () => undefined;
export const vi: any = {};
export function defineConfig(config: unknown): unknown {
  return config;
}
