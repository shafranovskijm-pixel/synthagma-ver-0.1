import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const items: Array<{ bucket: string; path: string; storageType: "internal" | "external" }> = body.items || [];
    if (!items.length) {
      return new Response(JSON.stringify({ error: "No items" }), { status: 400, headers: corsHeaders });
    }

    // Group by bucket
    const internalByBucket = new Map<string, string[]>();
    const externalByBucket = new Map<string, string[]>();
    for (const it of items) {
      const map = it.storageType === "external" ? externalByBucket : internalByBucket;
      if (!map.has(it.bucket)) map.set(it.bucket, []);
      map.get(it.bucket)!.push(it.path);
    }

    const results: Array<{ path: string; bucket: string; ok: boolean; error?: string }> = [];

    // Internal deletions
    for (const [bucket, paths] of internalByBucket) {
      const { data, error } = await admin.storage.from(bucket).remove(paths);
      if (error) {
        for (const p of paths) results.push({ path: p, bucket, ok: false, error: error.message });
      } else {
        const removedSet = new Set((data || []).map((d: any) => d.name));
        for (const p of paths) results.push({ path: p, bucket, ok: removedSet.has(p) || true });
      }
    }

    // External deletions
    if (externalByBucket.size > 0) {
      const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
      const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
      if (extUrl && extKey) {
        const extClient = createClient(extUrl, extKey);
        for (const [bucket, paths] of externalByBucket) {
          const { error } = await extClient.storage.from(bucket).remove(paths);
          if (error) {
            for (const p of paths) results.push({ path: p, bucket, ok: false, error: error.message });
          } else {
            for (const p of paths) results.push({ path: p, bucket, ok: true });
          }
        }
      } else {
        for (const [bucket, paths] of externalByBucket) {
          for (const p of paths) results.push({ path: p, bucket, ok: false, error: "External storage not configured" });
        }
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
