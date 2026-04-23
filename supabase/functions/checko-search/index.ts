import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEARCH_DAILY_LIMIT = 100;
const ENRICH_DAILY_LIMIT = 100;
const PAGE_SIZE = 100;

function todayMsk(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface SearchBody {
  regions?: number[];
  licenses?: string[];
  okveds?: string[];
  activeOnly?: boolean;
  limit?: number;
  autoEnrich?: boolean;
  presetId?: string | null;
  countOnly?: boolean;
}

async function fetchSearchPage(
  apiKey: string,
  params: { regions: number[]; licenses: string[]; okveds: string[]; activeOnly: boolean },
  page: number,
  limit: number,
): Promise<{ inns: string[]; total: number; meta?: any; error?: string; status: number }> {
  const qs = new URLSearchParams();
  qs.set('key', apiKey);
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  if (params.regions.length) qs.set('region', params.regions.join(','));
  if (params.licenses.length) qs.set('licens', params.licenses.join(','));
  if (params.okveds.length) qs.set('okved', params.okveds.join(','));
  if (params.activeOnly) qs.set('active', '1');

  const url = `https://api.checko.ru/v2/search?${qs.toString()}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { inns: [], total: 0, error: json?.message || `HTTP ${res.status}`, status: res.status, meta: json?.meta };
    }
    // Checko search response: { data: { Записи: [{ ИНН }], ВсегоЗаписей }, meta: {...} }
    const records: any[] = json?.data?.Записи || json?.data?.records || json?.data || [];
    const total: number = json?.data?.ВсегоЗаписей ?? json?.data?.total ?? json?.meta?.total ?? records.length;
    const inns: string[] = records
      .map((r: any) => String(r?.ИНН || r?.inn || r?.INN || '').replace(/\D/g, ''))
      .filter((v: string) => /^\d{10}$|^\d{12}$/.test(v));
    return { inns, total: Number(total) || 0, meta: json?.meta, status: res.status };
  } catch (e) {
    return { inns: [], total: 0, error: (e as Error).message, status: 0 };
  }
}

async function bumpSearchUsage(supabase: any, day: string, increment: number, balance: number | null) {
  const { data } = await supabase
    .from('checko_api_usage')
    .select('search_requests_count, requests_count')
    .eq('date', day)
    .maybeSingle();
  const current = data?.search_requests_count ?? 0;
  const patch: any = {
    date: day,
    search_requests_count: current + increment,
    requests_count: data?.requests_count ?? 0,
    last_used_at: new Date().toISOString(),
  };
  if (typeof balance === 'number') patch.last_balance = balance;
  await supabase.from('checko_api_usage').upsert(patch, { onConflict: 'date' });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const API_KEY = Deno.env.get('CHECKO_API_KEY');

    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'CHECKO_API_KEY не настроен' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth: only admins
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: SearchBody = await req.json().catch(() => ({}));
    const regions = Array.isArray(body.regions) ? body.regions.filter((r) => Number.isFinite(r)) : [];
    const licenses = Array.isArray(body.licenses) ? body.licenses.filter((l) => typeof l === 'string' && l.length) : [];
    const okveds = Array.isArray(body.okveds) ? body.okveds.filter((o) => typeof o === 'string' && o.length) : [];
    const activeOnly = body.activeOnly !== false;
    const limit = Math.max(1, Math.min(1000, Number(body.limit) || 1000));
    const autoEnrich = body.autoEnrich === true;
    const countOnly = body.countOnly === true;

    if (!regions.length && !licenses.length && !okveds.length) {
      return new Response(JSON.stringify({ error: 'Укажите хотя бы один фильтр (регион, лицензия или ОКВЭД)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const day = todayMsk();
    const { data: usage } = await adminClient
      .from('checko_api_usage')
      .select('search_requests_count')
      .eq('date', day)
      .maybeSingle();
    const searchUsedToday = usage?.search_requests_count ?? 0;
    const searchRemaining = Math.max(0, SEARCH_DAILY_LIMIT - searchUsedToday);

    if (searchRemaining === 0) {
      return new Response(JSON.stringify({
        error: 'Дневной лимит запросов поиска исчерпан (100/день). Попробуйте завтра.',
        search_used_today: searchUsedToday,
        search_remaining: 0,
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const params = { regions, licenses, okveds, activeOnly };

    // Step 1: probe page 1 to learn total
    const probe = await fetchSearchPage(API_KEY, params, 1, countOnly ? 1 : PAGE_SIZE);
    let searchRequestsUsed = 1;
    const lastBalance = (probe.meta?.balance as number) ?? null;
    await bumpSearchUsage(adminClient, day, 1, lastBalance);

    if (probe.error) {
      return new Response(JSON.stringify({
        error: `Checko поиск: ${probe.error}`,
        search_requests_used: searchRequestsUsed,
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const total = probe.total;

    if (countOnly) {
      const estimatedRequests = Math.max(1, Math.ceil(Math.min(total, limit) / PAGE_SIZE));
      return new Response(JSON.stringify({
        total,
        estimated_search_requests: estimatedRequests,
        search_used_today: searchUsedToday + 1,
        search_remaining: Math.max(0, SEARCH_DAILY_LIMIT - searchUsedToday - 1),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const allInns = new Set<string>(probe.inns);
    const cap = Math.min(total, limit);
    const totalPages = Math.max(1, Math.ceil(cap / PAGE_SIZE));
    const maxAdditional = Math.min(totalPages - 1, searchRemaining - 1);

    for (let page = 2; page <= 1 + maxAdditional; page++) {
      const r = await fetchSearchPage(API_KEY, params, page, PAGE_SIZE);
      searchRequestsUsed += 1;
      await bumpSearchUsage(adminClient, day, 1, (r.meta?.balance as number) ?? null);
      if (r.error) break;
      r.inns.forEach((i) => allInns.add(i));
      if (allInns.size >= cap) break;
      await sleep(300);
    }

    const foundInns = Array.from(allInns).slice(0, cap);

    // Step 2: queue all into pending
    if (foundInns.length) {
      await adminClient
        .from('checko_pending_inns')
        .upsert(
          foundInns.map((inn) => ({ inn, note: 'queued: from search' })),
          { onConflict: 'inn', ignoreDuplicates: true },
        );
    }

    // Step 3: optional immediate enrichment via internal call to checko-enrich-batch
    let enrichedCount = 0;
    let enrichResult: any = null;
    if (autoEnrich && foundInns.length) {
      const { data: enrichUsage } = await adminClient
        .from('checko_api_usage')
        .select('requests_count')
        .eq('date', day)
        .maybeSingle();
      const enrichUsedToday = enrichUsage?.requests_count ?? 0;
      const enrichRemaining = Math.max(0, ENRICH_DAILY_LIMIT - enrichUsedToday);
      const innsToEnrich = foundInns.slice(0, enrichRemaining);

      if (innsToEnrich.length) {
        try {
          const invokeRes = await fetch(`${SUPABASE_URL}/functions/v1/checko-enrich-batch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authHeader,
              apikey: ANON_KEY,
            },
            body: JSON.stringify({ inns: innsToEnrich, mode: 'add' }),
          });
          enrichResult = await invokeRes.json().catch(() => null);
          enrichedCount = enrichResult?.processed ?? 0;
        } catch (e) {
          console.error('enrich-batch invocation failed', e);
        }
      }
    }

    const queuedCount = Math.max(0, foundInns.length - enrichedCount);

    // Save run history
    await adminClient.from('checko_search_runs').insert({
      preset_id: body.presetId ?? null,
      regions, licenses, okveds, active_only: activeOnly,
      found_count: foundInns.length,
      enriched_count: enrichedCount,
      queued_count: queuedCount,
      search_requests_used: searchRequestsUsed,
      status: 'completed',
      created_by: user.id,
    });

    return new Response(JSON.stringify({
      success: true,
      total,
      found_inns: foundInns,
      found_count: foundInns.length,
      enriched_count: enrichedCount,
      queued_count: queuedCount,
      search_requests_used: searchRequestsUsed,
      search_remaining: Math.max(0, SEARCH_DAILY_LIMIT - searchUsedToday - searchRequestsUsed),
      enrich_result: enrichResult,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('checko-search error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
