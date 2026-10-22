import {describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {admissionFetch} from '../../../functions/_shared/admission-case-access';
import {renderFaithfulEducationPdf} from '../../../functions/_shared/faithful-pdf';
import type {EducationArtifactDependencies} from '../../../functions/_shared/education-issuance-artifact';

describe('UC019 genuine Deno entry original/service credential separation', () => {
  it('pins each RPC Authorization independently, uses no persisted sessions and never substitutes service identity for caller', async () => {
    let handler!: (request: Request) => Promise<Response>, captured!: EducationArtifactDependencies;
    const bindings: {options: any; rpc: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn>}[] = [];
    const createClient = vi.fn((_url: string, _key: string, options: any) => {
      const setHeader = vi.fn(), rpc = vi.fn(() => ({setHeader})); bindings.push({options, rpc, setHeader});
      return {auth: {getUser: vi.fn()}, storage: {from: vi.fn()}, rpc};
    });
    const boundary = vi.fn(async (_request: Request, deps: EducationArtifactDependencies) => {captured = deps; return new Response('{}');});
    const env = {SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'SYNTHETIC_ANON', SUPABASE_SERVICE_ROLE_KEY: 'SYNTHETIC_SERVICE', BROWSERLESS_TOKEN: 'SYNTHETIC_RENDERER'};
    const source = readFileSync('supabase/functions/education-issuance-artifact/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
    const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}}).outputText;
    new Function('createClient', 'educationArtifactRequest', 'admissionFetch', 'renderFaithfulEducationPdf', 'Deno', 'fetch', compiled)(
      createClient, boundary, admissionFetch, renderFaithfulEducationPdf,
      {env: {get: (key: keyof typeof env) => env[key]}, serve: (value: typeof handler) => {handler = value;}}, vi.fn());
    await handler(new Request('https://synthetic.invalid'));
    const signal = new AbortController().signal;
    const caller = captured.createCaller('Bearer SYNTHETIC_ORIGINAL', signal), service = captured.createService(signal);
    caller.rpc('uc_education_artifact_context', {}); service.rpc('uc_attest_education_issuance_staging', {});
    expect(createClient.mock.calls.map(call => call[1])).toEqual(['SYNTHETIC_ANON', 'SYNTHETIC_SERVICE']);
    expect(bindings[0].setHeader).toHaveBeenCalledWith('Authorization', 'Bearer SYNTHETIC_ORIGINAL');
    expect(bindings[1].setHeader).toHaveBeenCalledWith('Authorization', 'Bearer SYNTHETIC_SERVICE');
    for (const binding of bindings) expect(binding.options.auth).toEqual({persistSession: false, autoRefreshToken: false, detectSessionInUrl: false});
    expect(captured.configured).toBe(true);
  });

  it('deployment imports use the exact already-reviewed parser pins, not a remote mutable converter', () => {
    const config = JSON.parse(readFileSync('supabase/functions/education-issuance-artifact/deno.json', 'utf8'));
    expect(config.imports).toEqual({parse5: 'npm:parse5@7.3.0', postcss: 'npm:postcss@8.5.6', 'postcss-value-parser': 'npm:postcss-value-parser@4.2.0'});
  });
});
