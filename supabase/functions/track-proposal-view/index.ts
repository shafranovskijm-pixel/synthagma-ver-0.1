// Edge function: track-proposal-view
// Возвращает 1×1 прозрачный пиксель и инкрементирует счётчик просмотров КП.
// Используется как <img src=".../track-proposal-view?id=<proposal_id>"> в письме.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 1×1 transparent GIF
const PIXEL = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (id) {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Read current counts
      const { data: existing } = await supabase
        .from('commercial_proposals')
        .select('view_count, first_viewed_at')
        .eq('id', id)
        .maybeSingle();

      if (existing) {
        const update: Record<string, any> = {
          view_count: (existing.view_count || 0) + 1,
          last_viewed_at: new Date().toISOString(),
        };
        if (!existing.first_viewed_at) {
          update.first_viewed_at = new Date().toISOString();
        }
        await supabase.from('commercial_proposals').update(update).eq('id', id);
      }
    } catch (e) {
      console.error('track-proposal-view error', e);
    }
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
});
