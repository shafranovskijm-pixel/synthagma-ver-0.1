// Lightweight health-check endpoint used by /connection-check page
// to detect whether corporate firewall / antivirus blocks edge functions.
// No JWT required, no DB calls — just returns OK as fast as possible.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ ok: true, ts: Date.now(), region: Deno.env.get('SB_REGION') ?? 'unknown' }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      status: 200,
    },
  );
});
