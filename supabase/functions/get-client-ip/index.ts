// Returns the caller's IP address from standard proxy headers.
// Public endpoint, no auth required.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const xff = req.headers.get("x-forwarded-for") || "";
  const cf = req.headers.get("cf-connecting-ip") || "";
  const real = req.headers.get("x-real-ip") || "";
  const ip = (xff.split(",")[0] || cf || real || "").trim() || null;
  return new Response(JSON.stringify({ ip }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
