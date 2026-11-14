import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import * as XLSX from 'npm:xlsx@0.18.5';
import { validateInflatedXlsx } from '../_shared/rtn/official-source.ts';
import { normalizeEnergy, type EnergyWorkbook } from '../_shared/rtn/energy-bank.ts';
import { type WorkerClient } from '../_shared/rtn/check-worker.ts';
import { createRtnHandler } from '../_shared/rtn/http-handler.ts';
import a1Questions from '../_shared/rtn/data/a1-69349ffd5013.json' with { type: 'json' };

const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !anon || !key) throw new Error('RTN_SERVICE_CONFIGURATION_REQUIRED');
const auth = { persistSession: false, autoRefreshToken: false };
const service = createClient(url, key, { auth });
Deno.serve(createRtnHandler({
  service: service as unknown as WorkerClient,
  user: authorization => createClient(url, anon, { auth, global: { headers: { Authorization: authorization } } }) as never,
  normalize: async (bytes, hash, source) => {
    // Image-only PDFs stage immutable originals for OCR/substantive review.
    // The worker never guesses their text, authorial options or correct keys.
    if (source.parser === 'industrial-pdf') {
      // This OCR transcription is pinned to the exact public original. Only
      // visually reviewed subsets can subsequently receive graded answer keys.
      if (hash === '69349ffd501308449e68a7f46caf416808faec2795ae72f8f424f7eea9d49bcc') {
        return [{ code: 'A.1', title: 'Основы промышленной безопасности', domain: 'industrial-safety', questions: a1Questions }];
      }
      return [];
    }
    await validateInflatedXlsx(bytes);
    const workbook = XLSX.read(bytes, { type: 'array', cellNF: true, cellText: true, cellDates: false, bookVBA: false, WTF: true });
    return await normalizeEnergy(workbook as unknown as EnergyWorkbook, hash);
  },
}));
