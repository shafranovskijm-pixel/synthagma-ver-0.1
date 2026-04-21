import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runEnrich } from "../checko-enrich-batch/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: settings } = await supabase
      .from('checko_settings').select('*').eq('id', 1).maybeSingle();

    if (!settings?.auto_enrich_enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: 'auto_enrich_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process up to 100: 70 from queue, 30 stale (priority on new inns)
    const result = await runEnrich({
      maxFromQueue: 100,
      maxFromStale: 100, // runEnrich will cap by remaining quota anyway
    });

    await supabase.from('checko_settings').update({
      last_auto_run_at: new Date().toISOString(),
      last_auto_processed: result.processed,
      last_auto_error: result.errors?.length ? `${result.errors.length} errors (first: ${result.errors[0]?.error})` : null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
