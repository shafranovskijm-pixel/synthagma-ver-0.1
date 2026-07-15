// Returns the caller's IP address and best-effort geo info.
// Public endpoint, no auth required. Server-side geo lookup avoids client-side
// blocks (Roskomnadzor / corporate firewalls often block ipapi.co directly).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function lookupGeo(ip: string) {
  const empty = { country: null, region: null, org: null, asn: null };
  if (!ip) return empty;
  // Try ip-api.com (free, no key, allows server-to-server, returns JSON)
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const resp = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp,org,as`,
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    if (resp.ok) {
      const d: any = await resp.json();
      if (d.status === "success") {
        return {
          country: d.countryCode || d.country || null,
          region: [d.regionName, d.city].filter(Boolean).join(", ") || null,
          org: d.isp || d.org || null,
          asn: d.as || null,
        };
      }
    }
  } catch {
    // fallthrough to ipapi.co
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const resp = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: ctrl.signal });
    clearTimeout(t);
    if (resp.ok) {
      const d: any = await resp.json();
      return {
        country: d.country_code || d.country || null,
        region: [d.region, d.city].filter(Boolean).join(", ") || null,
        org: d.org || d.org_name || null,
        asn: d.asn || null,
      };
    }
  } catch {
    // ignore
  }
  return empty;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const xff = req.headers.get("x-forwarded-for") || "";
  const cf = req.headers.get("cf-connecting-ip") || "";
  const real = req.headers.get("x-real-ip") || "";
  const ip = (xff.split(",")[0] || cf || real || "").trim() || null;

  const url = new URL(req.url);
  const wantGeo = url.searchParams.get("geo") === "1";

  const geo = wantGeo && ip ? await lookupGeo(ip) : { country: null, region: null, org: null, asn: null };

  return new Response(JSON.stringify({ ip, ...geo }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
