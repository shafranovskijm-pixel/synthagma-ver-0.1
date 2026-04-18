// Edge Function: kinescope-storage-stats
// Aggregates Kinescope video usage (bytes / seconds / count) per organization
// and across the whole platform. Caches results in `kinescope_usage_cache`.
//
// Mapping logic (Kinescope video_id -> organization_id):
//   - lessons.content (text) — may contain "kinescope:<id>" or
//     "https://kinescope.io/embed/<id>". We scan all lessons of org's courses.
//   - webinars.kinescope_video_id / webinars.kinescope_live_id — direct columns.
//
// Pricing (rough estimate, RUB/month, public Kinescope-style tariffs):
//   - storage:  2.5 RUB / GB / month
//   - delivery: 1.5 RUB / GB (one-time per delivered GB; we estimate 1x/month)
// These are placeholders — Kinescope billing API is not public, so we show
// the value with an "Оценка" badge in the UI.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KINESCOPE_API = "https://api.kinescope.io/v1";
const CACHE_TTL_MIN = 30;

const PRICE_STORAGE_RUB_PER_GB_MONTH = 2.5;
const PRICE_DELIVERY_RUB_PER_GB = 1.5;

type KinescopeVideo = {
  id: string;
  size?: number;
  duration?: number;
  status?: string;
};

type OrgAggregate = {
  organization_id: string | null;
  organization_name?: string | null;
  total_bytes: number;
  total_seconds: number;
  videos_count: number;
};

function extractKinescopeId(text: string | null | undefined): string | null {
  if (!text) return null;
  if (text.startsWith("kinescope:")) return text.replace("kinescope:", "").trim();
  const m = text.match(/kinescope\.io\/(?:embed\/)?([a-f0-9-]{16,})/i);
  return m ? m[1] : null;
}

async function fetchAllKinescopeVideos(token: string): Promise<KinescopeVideo[]> {
  const all: KinescopeVideo[] = [];
  const perPage = 100;
  let page = 1;
  // Hard safety cap to avoid runaway loops
  const MAX_PAGES = 100;
  while (page <= MAX_PAGES) {
    const res = await fetch(
      `${KINESCOPE_API}/videos?page=${page}&per_page=${perPage}&order=created_at.desc`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Kinescope /videos failed: ${res.status} ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    const items: KinescopeVideo[] = json?.data ?? [];
    all.push(...items);
    const total = json?.meta?.pagination?.total ?? all.length;
    if (all.length >= total || items.length === 0) break;
    page++;
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const orgIdParam = url.searchParams.get("organization_id");
    const forceRefresh = url.searchParams.get("force") === "1";
    let body: any = {};
    try {
      if (req.method === "POST") body = await req.json();
    } catch { /* no body */ }
    const organizationId: string | null = orgIdParam || body?.organization_id || null;
    const force = forceRefresh || body?.force === true;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const KINESCOPE_TOKEN = Deno.env.get("KINESCOPE_API_TOKEN");

    if (!KINESCOPE_TOKEN) {
      return new Response(
        JSON.stringify({ error: "KINESCOPE_API_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Try cache (unless force)
    if (!force) {
      const { data: cached } = await admin
        .from("kinescope_usage_cache")
        .select("*")
        .is("organization_id", organizationId === null ? true : null as any)
        .eq("organization_id", organizationId as any)
        .maybeSingle();
      // Note: PostgREST .is() for null and .eq() for value — handle both
      let row = cached;
      if (!row) {
        const q = admin.from("kinescope_usage_cache").select("*");
        const { data: r2 } = organizationId
          ? await q.eq("organization_id", organizationId).maybeSingle()
          : await q.is("organization_id", null).maybeSingle();
        row = r2;
      }
      if (row) {
        const ageMin = (Date.now() - new Date(row.fetched_at).getTime()) / 60000;
        if (ageMin < CACHE_TTL_MIN) {
          return new Response(
            JSON.stringify({
              cached: true,
              age_minutes: Math.round(ageMin),
              total_bytes: row.total_bytes,
              total_seconds: row.total_seconds,
              videos_count: row.videos_count,
              by_org: row.by_org_json ?? [],
              billing: row.billing_json ?? null,
              fetched_at: row.fetched_at,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // 2. Fetch all Kinescope videos
    const videos = await fetchAllKinescopeVideos(KINESCOPE_TOKEN);
    const sizeMap = new Map<string, { size: number; duration: number }>();
    for (const v of videos) {
      sizeMap.set(v.id, { size: v.size ?? 0, duration: v.duration ?? 0 });
    }

    // 3. Build mapping video_id -> organization_id
    // (a) lessons.content -> course.organization_id
    const { data: lessons } = await admin
      .from("lessons")
      .select("content, course_id, courses!inner(organization_id)")
      .not("content", "is", null);

    const videoToOrg = new Map<string, string>();
    for (const l of lessons ?? []) {
      const id = extractKinescopeId((l as any).content);
      if (!id) continue;
      const orgId = (l as any).courses?.organization_id;
      if (orgId) videoToOrg.set(id, orgId);
    }

    // (b) webinars.kinescope_video_id (and live id if it represents a recorded video)
    const { data: webinars } = await admin
      .from("webinars")
      .select("kinescope_video_id, kinescope_live_id, organization_id");
    for (const w of webinars ?? []) {
      const orgId = (w as any).organization_id;
      if (!orgId) continue;
      const vId = (w as any).kinescope_video_id;
      const lId = (w as any).kinescope_live_id;
      if (vId) videoToOrg.set(vId, orgId);
      if (lId) videoToOrg.set(lId, orgId);
    }

    // 4. Aggregate
    const orgAgg = new Map<string, OrgAggregate>();
    let unmappedBytes = 0;
    let unmappedSeconds = 0;
    let unmappedCount = 0;
    let totalBytes = 0;
    let totalSeconds = 0;

    for (const v of videos) {
      const size = v.size ?? 0;
      const dur = v.duration ?? 0;
      totalBytes += size;
      totalSeconds += dur;
      const orgId = videoToOrg.get(v.id);
      if (!orgId) {
        unmappedBytes += size;
        unmappedSeconds += dur;
        unmappedCount++;
        continue;
      }
      const cur = orgAgg.get(orgId) ?? {
        organization_id: orgId,
        total_bytes: 0,
        total_seconds: 0,
        videos_count: 0,
      };
      cur.total_bytes += size;
      cur.total_seconds += dur;
      cur.videos_count += 1;
      orgAgg.set(orgId, cur);
    }

    // 5. Resolve org names
    const orgIds = Array.from(orgAgg.keys());
    if (orgIds.length > 0) {
      const { data: orgs } = await admin
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);
      for (const o of orgs ?? []) {
        const a = orgAgg.get(o.id);
        if (a) a.organization_name = o.name;
      }
    }

    const byOrg = Array.from(orgAgg.values()).sort(
      (a, b) => b.total_bytes - a.total_bytes,
    );
    if (unmappedCount > 0) {
      byOrg.push({
        organization_id: null,
        organization_name: "Не привязано к организации",
        total_bytes: unmappedBytes,
        total_seconds: unmappedSeconds,
        videos_count: unmappedCount,
      });
    }

    // 6. Billing estimate (rough, public-pricing based)
    const totalGB = totalBytes / 1024 ** 3;
    const billing = {
      storage_rub: Math.round(totalGB * PRICE_STORAGE_RUB_PER_GB_MONTH * 100) / 100,
      delivery_rub: Math.round(totalGB * PRICE_DELIVERY_RUB_PER_GB * 100) / 100,
      total_rub: Math.round(
        totalGB * (PRICE_STORAGE_RUB_PER_GB_MONTH + PRICE_DELIVERY_RUB_PER_GB) * 100,
      ) / 100,
      is_estimate: true,
      pricing: {
        storage_rub_per_gb_month: PRICE_STORAGE_RUB_PER_GB_MONTH,
        delivery_rub_per_gb: PRICE_DELIVERY_RUB_PER_GB,
      },
    };

    // 7. Persist cache rows: one per org + global aggregate (organization_id = null)
    const now = new Date().toISOString();
    const upserts = [
      {
        organization_id: null,
        total_bytes: totalBytes,
        total_seconds: totalSeconds,
        videos_count: videos.length,
        by_org_json: byOrg,
        billing_json: billing,
        fetched_at: now,
      },
      ...byOrg
        .filter((o) => o.organization_id !== null)
        .map((o) => {
          const gb = o.total_bytes / 1024 ** 3;
          return {
            organization_id: o.organization_id,
            total_bytes: o.total_bytes,
            total_seconds: o.total_seconds,
            videos_count: o.videos_count,
            by_org_json: null,
            billing_json: {
              storage_rub:
                Math.round(gb * PRICE_STORAGE_RUB_PER_GB_MONTH * 100) / 100,
              delivery_rub: Math.round(gb * PRICE_DELIVERY_RUB_PER_GB * 100) / 100,
              total_rub:
                Math.round(
                  gb * (PRICE_STORAGE_RUB_PER_GB_MONTH + PRICE_DELIVERY_RUB_PER_GB) * 100,
                ) / 100,
              is_estimate: true,
            },
            fetched_at: now,
          };
        }),
    ];

    // Upsert one row at a time to avoid upsert conflicts on null PK
    for (const row of upserts) {
      if (row.organization_id === null) {
        await admin.from("kinescope_usage_cache").delete().is("organization_id", null);
        await admin.from("kinescope_usage_cache").insert(row);
      } else {
        await admin
          .from("kinescope_usage_cache")
          .upsert(row, { onConflict: "organization_id" });
      }
    }

    // 8. Return either the requested org or the global view
    if (organizationId) {
      const o = orgAgg.get(organizationId);
      const gb = (o?.total_bytes ?? 0) / 1024 ** 3;
      return new Response(
        JSON.stringify({
          cached: false,
          organization_id: organizationId,
          total_bytes: o?.total_bytes ?? 0,
          total_seconds: o?.total_seconds ?? 0,
          videos_count: o?.videos_count ?? 0,
          billing: {
            storage_rub:
              Math.round(gb * PRICE_STORAGE_RUB_PER_GB_MONTH * 100) / 100,
            delivery_rub: Math.round(gb * PRICE_DELIVERY_RUB_PER_GB * 100) / 100,
            total_rub:
              Math.round(
                gb * (PRICE_STORAGE_RUB_PER_GB_MONTH + PRICE_DELIVERY_RUB_PER_GB) * 100,
              ) / 100,
            is_estimate: true,
          },
          fetched_at: now,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        cached: false,
        total_bytes: totalBytes,
        total_seconds: totalSeconds,
        videos_count: videos.length,
        by_org: byOrg,
        billing,
        fetched_at: now,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("kinescope-storage-stats error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
