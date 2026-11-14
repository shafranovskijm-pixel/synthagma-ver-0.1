import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import * as XLSX from 'npm:xlsx@0.18.5';
import { validateInflatedXlsx } from './official-source.ts';
import { normalizeEnergy, type EnergyWorkbook } from './energy-bank.ts';
import { type Normalizer, type WorkerClient } from './check-worker.ts';
import a1Questions from './data/a1-69349ffd5013.json' with { type: 'json' };

const normalize: Normalizer = async (bytes, hash, source) => {
  if (source.parser === 'industrial-pdf') {
    // OCR is pinned to the immutable public original; this is not a graded key.
    // New scanned originals await visual extraction and substantive review.
    if (hash === '69349ffd501308449e68a7f46caf416808faec2795ae72f8f424f7eea9d49bcc') {
      return [{ code: 'A.1', title: 'Основы промышленной безопасности', domain: 'industrial-safety', questions: a1Questions }];
    }
    return [];
  }
  await validateInflatedXlsx(bytes);
  const workbook = XLSX.read(bytes, { type: 'array', cellNF: true, cellText: true, cellDates: false, bookVBA: false, WTF: true });
  return await normalizeEnergy(workbook as unknown as EnergyWorkbook, hash);
};

export function createRtnRuntime() {
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !key) throw new Error('RTN_SERVICE_CONFIGURATION_REQUIRED');
  const auth = { persistSession: false, autoRefreshToken: false };
  return {
    service: createClient(url, key, { auth }) as unknown as WorkerClient,
    user: (authorization: string) => createClient(url, anon, { auth, global: { headers: { Authorization: authorization } } }) as never,
    normalize,
  };
}
