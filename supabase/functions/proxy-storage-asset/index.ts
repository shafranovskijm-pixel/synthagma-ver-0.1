const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Expose-Headers": "content-type, content-length, content-range, accept-ranges, cache-control, etag, last-modified",
};

const ALLOWED_HOSTS = new Set([
  "qpsfswrsuqvffdrnpsso.supabase.co",
]);

const ALLOWED_BUCKETS = new Set([
  "course-videos",
  "course-files",
  "presentations",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateTarget(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!ALLOWED_HOSTS.has(url.host)) return null;

  const match = url.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\//);
  if (!match || !ALLOWED_BUCKETS.has(match[1])) return null;

  return url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return json({ error: "Method not allowed" }, 405);
  }

  const requestUrl = new URL(req.url);
  const target = validateTarget(requestUrl.searchParams.get("u"));
  if (!target) return json({ error: "Unsupported asset URL" }, 400);

  try {
    const upstreamHeaders = new Headers();
    const range = req.headers.get("range");
    if (range) upstreamHeaders.set("range", range);

    const upstream = await fetch(target, {
      method: req.method,
      headers: upstreamHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(120000),
    });

    const headers = new Headers(corsHeaders);
    for (const name of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
      "last-modified",
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
    headers.set("Cache-Control", headers.get("cache-control") || "public, max-age=3600");

    return new Response(req.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Asset proxy failed" }, 502);
  }
});