import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAILY_LIMIT = 100;

function todayMsk(): string {
  // Moscow = UTC+3
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Validate Russian INN check digit (10- or 12-digit)
function isValidInn(inn: string): boolean {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return false;
  const d = inn.split('').map(Number);
  if (inn.length === 10) {
    const w = [2, 4, 10, 3, 5, 9, 4, 6, 8, 0];
    const s = w.reduce((a, k, i) => a + k * d[i], 0) % 11 % 10;
    return s === d[9];
  }
  const w1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8, 0];
  const w2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8, 0];
  const s1 = w1.reduce((a, k, i) => a + k * d[i], 0) % 11 % 10;
  const s2 = w2.reduce((a, k, i) => a + k * d[i], 0) % 11 % 10;
  return s1 === d[10] && s2 === d[11];
}

async function fetchCheckoCompany(inn: string, apiKey: string): Promise<{ data?: any; meta?: any; error?: string; status: number }> {
  const url = `https://api.checko.ru/v2/company?key=${encodeURIComponent(apiKey)}&inn=${encodeURIComponent(inn)}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (json?.message || `HTTP ${res.status}`), status: res.status, meta: json?.meta };
    }
    return { data: json?.data, meta: json?.meta, status: res.status };
  } catch (e) {
    return { error: (e as Error).message, status: 0 };
  }
}

function pickEduLicense(licenses: any[]): any | null {
  if (!Array.isArray(licenses) || licenses.length === 0) return null;
  const eduIdx = licenses.findIndex((l) => {
    const acts: string[] = Array.isArray(l?.ВидДеят) ? l.ВидДеят : [];
    return acts.some((a: string) => /образоват/i.test(a || ''));
  });
  return eduIdx >= 0 ? licenses[eduIdx] : licenses[0];
}

function mapCheckoToRow(inn: string, c: any): Record<string, unknown> {
  const addrObj = c?.ЮрАдрес || {};
  const contacts = c?.Контакты || {};
  const phones: string[] = Array.isArray(contacts.Тел) ? contacts.Тел : [];
  const emails: string[] = Array.isArray(contacts.Емэйл) ? contacts.Емэйл : [];
  const head = Array.isArray(c?.Руковод) ? c.Руковод[0] : null;
  const okvedMain = c?.ОКВЭД ? `${c.ОКВЭД.Код || ''} ${c.ОКВЭД.Наим || ''}`.trim() : null;
  const okvedList = Array.isArray(c?.ОКВЭДДоп) ? c.ОКВЭДДоп : null;
  const licenses: any[] = Array.isArray(c?.Лиценз) ? c.Лиценз : [];
  const hasEdu = licenses.some((l) => Array.isArray(l?.ВидДеят) && l.ВидДеят.some((a: string) => /образоват/i.test(a || '')));
  const lic = pickEduLicense(licenses);
  const branches = c?.Подразд?.Филиал;
  const ogrn = c?.ОГРН || null;

  const toDate = (v: any): string | null => {
    if (!v) return null;
    const s = String(v);
    // Checko dates are usually "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };

  return {
    inn,
    ogrn,
    name: c?.НаимСокр || c?.НаимПолн || `ИНН ${inn}`,
    short_name: c?.НаимСокр || null,
    full_name: c?.НаимПолн || null,
    kpp: c?.КПП || null,
    okpo: c?.ОКПО || null,
    registration_date: toDate(c?.ДатаРег),
    address: addrObj?.АдресРФ || null,
    city: addrObj?.НасПункт || addrObj?.Город || null,
    region: c?.Регион?.Наим || addrObj?.Регион?.Наим || null,
    phone: phones[0] || null,
    phones: phones.length ? phones : null,
    email: emails[0] || null,
    emails: emails.length ? emails : null,
    website: contacts?.ВебСайт || null,
    social_links: (contacts?.ВК || contacts?.МАХ || contacts?.Телеграм || contacts?.Telegram)
      ? { vk: contacts?.ВК || null, max: contacts?.МАХ || null, telegram: contacts?.Телеграм || contacts?.Telegram || null }
      : null,
    director: head?.ФИО || null,
    director_inn: head?.ИНН || null,
    director_position: head?.НаимДолжн || null,
    okved_main: okvedMain,
    okved_list: okvedList,
    licenses: licenses.length ? licenses : null,
    license_number: lic?.Номер || null,
    license_issue_date: toDate(lic?.Дата || lic?.ДатаНач),
    license_authority: lic?.ЛицОрг || null,
    license_activities: Array.isArray(lic?.ВидДеят) ? lic.ВидДеят : null,
    license_valid_to: toDate(lic?.ДатаОконч),
    has_education_license: hasEdu,
    status: c?.Статус?.Наим || null,
    employee_count: typeof c?.СЧР === 'number' ? c.СЧР : null,
    charter_capital: c?.УстКап?.Сумма ?? null,
    unfair_supplier: !!c?.НедобПост,
    mass_director: !!c?.МассРуковод,
    mass_address: !!(addrObj?.МассАдрес && (Array.isArray(addrObj.МассАдрес) ? addrObj.МассАдрес.length > 0 : true)),
    sanctions: !!c?.Санкции,
    successors: c?.Правопреем || null,
    predecessors: c?.Правопредш || null,
    branches_count: Array.isArray(branches) ? branches.length : null,
    last_data_date: toDate(c?.ДатаВып),
    raw_data: c,
    source_url: ogrn ? `https://checko.ru/company/ul/${ogrn}` : null,
    data_source: 'checko',
    parsed_at: new Date().toISOString(),
  };
}

async function getOrInitUsage(supabase: any, day: string) {
  const { data } = await supabase.from('checko_api_usage').select('*').eq('date', day).maybeSingle();
  if (data) return data;
  const { data: ins } = await supabase.from('checko_api_usage')
    .insert({ date: day, requests_count: 0 }).select().single();
  return ins;
}

async function bumpUsage(supabase: any, day: string, todayCount: number | null, balance: number | null) {
  const patch: any = { last_used_at: new Date().toISOString() };
  if (typeof todayCount === 'number') patch.requests_count = todayCount;
  if (typeof balance === 'number') patch.last_balance = balance;
  await supabase.from('checko_api_usage').upsert({ date: day, ...patch }, { onConflict: 'date' });
}

async function incrementLocalUsage(supabase: any, day: string) {
  // Fallback when API didn't return today_request_count
  const { data } = await supabase.from('checko_api_usage').select('requests_count').eq('date', day).maybeSingle();
  const current = data?.requests_count ?? 0;
  await supabase.from('checko_api_usage')
    .upsert({ date: day, requests_count: current + 1, last_used_at: new Date().toISOString() }, { onConflict: 'date' });
}

export async function runEnrich(opts: { inns?: string[]; mode?: 'add' | 'refresh'; maxFromQueue?: number; maxFromStale?: number }) {
  const API_KEY = Deno.env.get('CHECKO_API_KEY');
  if (!API_KEY) return { error: 'CHECKO_API_KEY not configured', processed: 0 };

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const day = todayMsk();
  const usage = await getOrInitUsage(supabase, day);
  let used = usage?.requests_count ?? 0;

  // Build target list
  let targets: string[] = [];
  const queued: string[] = [];
  const errors: { inn: string; error: string }[] = [];
  const invalid: string[] = [];

  if (opts.inns && opts.inns.length > 0) {
    const seen = new Set<string>();
    for (const raw of opts.inns) {
      const v = String(raw || '').replace(/\D/g, '');
      if (!v || seen.has(v)) continue;
      seen.add(v);
      if (!isValidInn(v)) { invalid.push(v); continue; }
      targets.push(v);
    }
  }

  // Fill from stale (refresh mode or autoRun)
  if (opts.maxFromStale && opts.maxFromStale > 0) {
    const { data: stale } = await supabase
      .from('sales_companies_db')
      .select('inn')
      .order('parsed_at', { ascending: true })
      .limit(opts.maxFromStale);
    for (const r of (stale || [])) {
      if (!targets.includes(r.inn)) targets.push(r.inn);
    }
  }

  // Fill from pending queue
  if (opts.maxFromQueue && opts.maxFromQueue > 0) {
    const { data: q } = await supabase
      .from('checko_pending_inns')
      .select('inn')
      .order('added_at', { ascending: true })
      .limit(opts.maxFromQueue);
    for (const r of (q || [])) {
      if (!targets.includes(r.inn)) targets.push(r.inn);
    }
  }

  const remainingQuota = Math.max(0, DAILY_LIMIT - used);
  const toProcess = targets.slice(0, remainingQuota);
  const overflow = targets.slice(remainingQuota);

  // Push overflow into the queue
  if (overflow.length > 0) {
    await supabase.from('checko_pending_inns').upsert(
      overflow.map((inn) => ({ inn, note: 'queued: daily quota exhausted' })),
      { onConflict: 'inn', ignoreDuplicates: true },
    );
    for (const inn of overflow) queued.push(inn);
  }

  let processed = 0;
  let lastBalance: number | null = null;
  let stopReason: string | null = null;

  // Process in chunks of 5 in parallel
  const CHUNK = 5;
  outer: for (let i = 0; i < toProcess.length; i += CHUNK) {
    const chunk = toProcess.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(async (inn) => ({ inn, res: await fetchCheckoCompany(inn, API_KEY) })));
    for (const { inn, res } of results) {
      const todayCount = res.meta?.today_request_count ?? null;
      const balance = res.meta?.balance ?? null;
      if (typeof balance === 'number') lastBalance = balance;
      if (typeof todayCount === 'number') {
        await bumpUsage(supabase, day, todayCount, balance);
        used = todayCount;
      } else {
        // Only count successful or definite-billed responses; on auth error don't count
        if (res.status !== 401 && res.status !== 403) {
          await incrementLocalUsage(supabase, day);
          used += 1;
        }
      }

      if (res.error || !res.data) {
        errors.push({ inn, error: res.error || 'no data' });
        // Quota / limit response from Checko
        if (res.status === 429 || /лимит|limit|quota/i.test(res.error || '')) {
          stopReason = 'quota_exhausted';
          break outer;
        }
        continue;
      }

      const row = mapCheckoToRow(inn, res.data);
      const { error: upErr } = await supabase
        .from('sales_companies_db')
        .upsert(row, { onConflict: 'inn' });
      if (upErr) {
        errors.push({ inn, error: upErr.message });
      } else {
        processed += 1;
        // Drop from pending queue if was there
        await supabase.from('checko_pending_inns').delete().eq('inn', inn);
      }

      if (used >= DAILY_LIMIT) { stopReason = 'quota_exhausted'; break outer; }
    }
    if (i + CHUNK < toProcess.length) await sleep(500);
  }

  const skippedQuota = stopReason === 'quota_exhausted' ? Math.max(0, toProcess.length - processed - errors.length) : 0;
  if (skippedQuota > 0) {
    const remaining = toProcess.slice(processed + errors.length);
    if (remaining.length) {
      await supabase.from('checko_pending_inns').upsert(
        remaining.map((inn) => ({ inn, note: 'queued: stopped mid-batch' })),
        { onConflict: 'inn', ignoreDuplicates: true },
      );
      for (const inn of remaining) queued.push(inn);
    }
  }

  return {
    processed,
    skipped_quota: skippedQuota,
    queued_inns: queued,
    invalid_inns: invalid,
    errors,
    today_used: used,
    today_remaining: Math.max(0, DAILY_LIMIT - used),
    balance: lastBalance,
    stop_reason: stopReason,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth: only admins
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await adminClient.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
    if (!roleRow || roleRow.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const inns = Array.isArray(body?.inns) ? body.inns : [];
    const mode: 'add' | 'refresh' = body?.mode === 'refresh' ? 'refresh' : 'add';

    const result = await runEnrich({
      inns,
      mode,
      maxFromStale: mode === 'refresh' ? 100 : 0,
      maxFromQueue: 0,
    });

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
