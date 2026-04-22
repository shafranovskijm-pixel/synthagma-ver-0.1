// Скачивает MP4 запись с LiveKit Cloud по recording_external_url
// и загружает в наш бакет webinar-recordings → обновляет recording_url в webinars.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
      .select("id, organization_id, recording_external_url, recording_url")
      .eq("id", webinarId).maybeSingle();
    if (!w) return json({ error: "Not found" }, 404);

    const { data: prof } = await admin.from("profiles").select("organization_id").eq("user_id", u.user.id).maybeSingle();
    const { data: rolesRow } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const roles = (rolesRow ?? []).map((r) => r.role);
    const isAdmin = roles.includes("admin");
    if (!isAdmin && prof?.organization_id !== w.organization_id) return json({ error: "Forbidden" }, 403);

    if (!w.recording_external_url) return json({ error: "Нет внешнего URL записи" }, 400);
    if (w.recording_url) return json({ ok: true, alreadyCopied: true, url: w.recording_url });

    const fileResp = await fetch(w.recording_external_url);
    if (!fileResp.ok) return json({ error: `Не удалось скачать: ${fileResp.status}` }, 502);
    const blob = await fileResp.arrayBuffer();
    const sizeBytes = blob.byteLength;
    const path = `${w.organization_id}/${webinarId}-${Date.now()}.mp4`;

    const { error: upErr } = await admin.storage.from("webinar-recordings")
      .upload(path, blob, { contentType: "video/mp4", upsert: true });
    if (upErr) return json({ error: upErr.message }, 500);

    const { data: signed } = await admin.storage.from("webinar-recordings")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl ?? null;

    await admin.from("webinars").update({
      recording_url: url,
      recording_size_bytes: sizeBytes,
      recording_status: "uploaded",
    }).eq("id", webinarId);

    return json({ ok: true, url, sizeBytes });
  } catch (e) {
    console.error("[livekit-copy-recording]", e);
    return json({ error: (e as Error).message || "Internal" }, 500);
  }
});

function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
