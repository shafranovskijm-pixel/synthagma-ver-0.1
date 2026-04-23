import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAILY_LIMIT = 100;

function todayMsk(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
    if (!roleRow || roleRow.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const day = todayMsk();
    const [usage, settings, queue, total] = await Promise.all([
      supabase.from('checko_api_usage').select('*').eq('date', day).maybeSingle(),
      supabase.from('checko_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('checko_pending_inns').select('inn', { count: 'exact', head: true }),
      supabase.from('sales_companies_db').select('inn', { count: 'exact', head: true }),
    ]);

    const used = usage.data?.requests_count ?? 0;
    const searchUsed = usage.data?.search_requests_count ?? 0;
    const SEARCH_LIMIT = 100;

    return new Response(JSON.stringify({
      today_used: used,
      today_remaining: Math.max(0, DAILY_LIMIT - used),
      daily_limit: DAILY_LIMIT,
      search_used: searchUsed,
      search_remaining: Math.max(0, SEARCH_LIMIT - searchUsed),
      search_daily_limit: SEARCH_LIMIT,
      balance: usage.data?.last_balance ?? null,
      auto_enrich_enabled: settings.data?.auto_enrich_enabled ?? false,
      last_auto_run_at: settings.data?.last_auto_run_at ?? null,
      last_auto_processed: settings.data?.last_auto_processed ?? null,
      last_auto_error: settings.data?.last_auto_error ?? null,
      queue_size: queue.count ?? 0,
      total_companies: total.count ?? 0,
      reset_at_msk: '00:00',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
