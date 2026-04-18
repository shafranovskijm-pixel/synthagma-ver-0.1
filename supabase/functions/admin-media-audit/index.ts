import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FileEntry {
  bucket: string;
  path: string;
  name: string;
  size: number;
  createdAt: string;
  organizationId: string | null;
  organizationName: string | null;
  publicUrl: string;
  isUsed: boolean;
  usedIn: Array<{ entityType: string; entityId: string; entityTitle: string }>;
  storageType: "internal" | "external";
}

async function listAllRecursive(client: any, bucket: string, prefix = ""): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      // Folders have id === null
      if (item.id === null) {
        const sub = await listAllRecursive(client, bucket, prefix ? `${prefix}/${item.name}` : item.name);
        out.push(...sub);
      } else {
        out.push({ ...item, fullPath: prefix ? `${prefix}/${item.name}` : item.name });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Collect all media references via RPC
    const { data: refs, error: refsErr } = await admin.rpc("admin_collect_media_references");
    if (refsErr) throw refsErr;

    // Build index of url substrings -> usedIn entries
    const refIndex: Array<{ url: string; entityType: string; entityId: string; entityTitle: string }> = [];
    for (const r of (refs || [])) {
      if (!r.reference_url) continue;
      refIndex.push({
        url: String(r.reference_url),
        entityType: r.entity_type,
        entityId: r.entity_id,
        entityTitle: r.entity_title || "",
      });
    }

    // Load orgs for name resolution
    const { data: orgs } = await admin.from("organizations").select("id, name, inn");
    const orgsMap = new Map<string, { name: string; inn: string | null }>();
    for (const o of orgs || []) orgsMap.set(o.id, { name: o.name, inn: o.inn });

    // 2) List internal buckets
    const internalBuckets = ["course-files", "presentations"];
    const allFiles: FileEntry[] = [];

    for (const bucket of internalBuckets) {
      try {
        const objects = await listAllRecursive(admin, bucket);
        for (const obj of objects) {
          const fullPath = obj.fullPath as string;
          const segments = fullPath.split("/");
          const orgId = segments[0]?.length === 36 ? segments[0] : null;
          const { data: pub } = admin.storage.from(bucket).getPublicUrl(fullPath);
          const publicUrl = pub.publicUrl;

          // Match: any reference url contains this path or publicUrl
          const matches = refIndex.filter(
            (r) => r.url.includes(fullPath) || (publicUrl && r.url.includes(publicUrl.split("/").slice(-3).join("/"))),
          );

          const orgInfo = orgId ? orgsMap.get(orgId) : null;
          allFiles.push({
            bucket,
            path: fullPath,
            name: obj.name,
            size: obj.metadata?.size || 0,
            createdAt: obj.created_at || "",
            organizationId: orgId,
            organizationName: orgInfo?.name || null,
            publicUrl,
            isUsed: matches.length > 0,
            usedIn: matches.slice(0, 10).map((m) => ({
              entityType: m.entityType,
              entityId: m.entityId,
              entityTitle: m.entityTitle,
            })),
            storageType: "internal",
          });
        }
      } catch (e) {
        console.error(`Error listing ${bucket}:`, e);
      }
    }

    // 3) External course-videos bucket
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
    if (extUrl && extKey) {
      try {
        const extClient = createClient(extUrl, extKey);
        const objects = await listAllRecursive(extClient, "course-videos");
        for (const obj of objects) {
          const fullPath = obj.fullPath as string;
          const segments = fullPath.split("/");
          const orgId = segments[0]?.length === 36 ? segments[0] : null;
          const { data: pub } = extClient.storage.from("course-videos").getPublicUrl(fullPath);
          const publicUrl = pub.publicUrl;

          const matches = refIndex.filter(
            (r) => r.url.includes(fullPath) || (publicUrl && r.url.includes(publicUrl.split("/").slice(-3).join("/"))),
          );

          const orgInfo = orgId ? orgsMap.get(orgId) : null;
          allFiles.push({
            bucket: "course-videos",
            path: fullPath,
            name: obj.name,
            size: obj.metadata?.size || 0,
            createdAt: obj.created_at || "",
            organizationId: orgId,
            organizationName: orgInfo?.name || null,
            publicUrl,
            isUsed: matches.length > 0,
            usedIn: matches.slice(0, 10).map((m) => ({
              entityType: m.entityType,
              entityId: m.entityId,
              entityTitle: m.entityTitle,
            })),
            storageType: "external",
          });
        }
      } catch (e) {
        console.error("External bucket error:", e);
      }
    }

    return new Response(
      JSON.stringify({ files: allFiles, totalRefs: refIndex.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
