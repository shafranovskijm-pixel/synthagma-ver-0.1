const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store",
};

/**
 * Legacy public demo links used to provision permanent auth users and
 * organizations with the service role. Keep the function name fail-closed so
 * old bundles and saved links cannot create more production data.
 */
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "Автоматическое создание демо-организации временно недоступно",
      code: "DEMO_ORGANIZATION_DISABLED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
