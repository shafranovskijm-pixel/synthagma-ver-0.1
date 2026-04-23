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
      .select("id, organization_id, recording_external_url, recording_url, recording_egress_id, recording_status")
      .eq("id", webinarId).maybeSingle();
    if (!w) return json({ error: "Not found" }, 404);

    const { data: prof } = await admin.from("profiles").select("organization_id").eq("user_id", u.user.id).maybeSingle();
    const { data: rolesRow } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const roles = (rolesRow ?? []).map((r) => r.role);
    const isAdmin = roles.includes("admin");
    if (!isAdmin && prof?.organization_id !== w.organization_id) return json({ error: "Forbidden" }, 403);

    if (w.recording_url) return json({ ok: true, alreadyCopied: true, url: w.recording_url });

    // Если внешнего URL ещё нет — пробуем получить его из LiveKit прямо сейчас (Egress мог только что закончиться)
    let externalUrl = w.recording_external_url ?? null;
    if (!externalUrl && w.recording_egress_id) {
      try {
        const { signLiveKitJwt, lkHttpUrl, getLiveKitEnv } = await import("../_shared/livekit-jwt.ts");
        const { apiKey, apiSecret, wsUrl } = getLiveKitEnv();
        const egressJwt = await signLiveKitJwt(apiKey, apiSecret, {
          video: { roomRecord: true, roomAdmin: true },
        }, 600);
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
          if (externalUrl) {
            await admin.from("webinars")
              .update({ recording_external_url: externalUrl })
              .eq("id", webinarId);
          }
        }
      } catch (e) {
        console.warn("[copy-recording] re-check external url failed", e);
      }
    }

    if (!externalUrl) {
      // Файл ещё не готов на стороне LiveKit. Просим клиент повторить.
      await admin.from("webinars")
        .update({ recording_status: "processing" })
        .eq("id", webinarId);
      return json({ ok: false, processing: true, retryAfterMs: 10000, error: "Запись ещё обрабатывается LiveKit" }, 202);
    }

    // Скачиваем с retry — иногда signed-url ещё не активен
    let fileResp: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      fileResp = await fetch(externalUrl);
      if (fileResp.ok) break;
      if (fileResp.status === 404 || fileResp.status === 403) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      break;
    }
    if (!fileResp || !fileResp.ok) {
      // 404 → файл ещё не появился, фронт повторит
      if (fileResp?.status === 404) {
        return json({ ok: false, processing: true, retryAfterMs: 10000, error: "Файл ещё не доступен" }, 202);
      }
      return json({ error: `Не удалось скачать: ${fileResp?.status ?? "network"}` }, 502);
    }
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
