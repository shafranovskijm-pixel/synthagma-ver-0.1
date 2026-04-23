// Останавливает Egress по webinarId. После остановки LiveKit Cloud отдаст file_url через GetEgressInfo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signLiveKitJwt, lkHttpUrl, getLiveKitEnv } from "../_shared/livekit-jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user?.id) return json({ error: "Unauthorized" }, 401);

    const { webinarId } = await req.json().catch(() => ({}));
    if (!webinarId) return json({ error: "webinarId required" }, 400);

    const { data: w } = await admin
      .from("webinars")
      .select("id, organization_id, host_user_id, recording_egress_id, recording_status")
      .eq("id", webinarId).maybeSingle();
    if (!w) return json({ error: "Not found" }, 404);

    const { data: prof } = await admin.from("profiles").select("organization_id").eq("user_id", u.user.id).maybeSingle();
    const { data: rolesRow } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const roles = (rolesRow ?? []).map((r) => r.role);
    const isAdmin = roles.includes("admin");
    const isOrgHost = prof?.organization_id === w.organization_id;
    if (!isAdmin && !isOrgHost && w.host_user_id !== u.user.id) return json({ error: "Forbidden" }, 403);

    if (!w.recording_egress_id) return json({ error: "No active recording" }, 400);

    const { apiKey, apiSecret, wsUrl } = getLiveKitEnv();
    const egressJwt = await signLiveKitJwt(apiKey, apiSecret, {
      video: { roomRecord: true, roomAdmin: true },
    }, 600);

    const stopResp = await fetch(`${lkHttpUrl(wsUrl)}/twirp/livekit.Egress/StopEgress`, {
      method: "POST",
      headers: { Authorization: `Bearer ${egressJwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ egress_id: w.recording_egress_id }),
    });
    const stopText = await stopResp.text();
    if (!stopResp.ok && stopResp.status !== 400) {
      console.error("[stop-egress]", stopResp.status, stopText);
    }

    // Получаем file_url через ListEgress с правильным фильтром egress_ids
    let externalUrl: string | null = null;
    try {
      const listResp = await fetch(`${lkHttpUrl(wsUrl)}/twirp/livekit.Egress/ListEgress`, {
        method: "POST",
        headers: { Authorization: `Bearer ${egressJwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ egress_ids: [w.recording_egress_id] }),
      });
      if (listResp.ok) {
        const j = await listResp.json();
        const item = (j?.items ?? [])[0];
        externalUrl =
          item?.file?.location ??
          item?.file_results?.[0]?.location ??
          item?.fileResults?.[0]?.location ??
          null;
      } else {
        console.warn("[stop-egress] ListEgress non-ok", listResp.status, await listResp.text());
      }
    } catch (e) {
      console.warn("[stop-egress] ListEgress failed", e);
    }

    // Если файл ещё не готов — ставим processing, фронт начнёт пуллинг копирования
    const newStatus = externalUrl ? "stopped" : "processing";

    await admin.from("webinars").update({
      recording_status: newStatus,
      recording_ended_at: new Date().toISOString(),
      recording_external_url: externalUrl,
    }).eq("id", webinarId);

    return json({ ok: true, externalUrl, status: newStatus });
  } catch (e) {
    console.error("[livekit-stop-recording]", e);
    return json({ error: (e as Error).message || "Internal" }, 500);
  }
});

function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
