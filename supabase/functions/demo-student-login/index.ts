const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store",
};

/**
 * The legacy implementation returned credentials for one shared production
 * student and mutated that account with the service role. Keep the deployed
 * function name fail-closed so old frontend bundles and saved URLs cannot
 * recreate or access that shared account.
 */
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "Демо-кабинет временно недоступен",
      code: "DEMO_STUDENT_DISABLED",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
