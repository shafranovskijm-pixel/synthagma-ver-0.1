// Cron-функция: каждую минуту находит вебинары с зависшей записью
// (recording_status IN ('processing','stopped','starting','active') и без recording_url)
// и пытается финализировать их через ту же логику, что и livekit-copy-recording.
// Гарантирует, что запись подхватится даже если хост закрыл вкладку до завершения Egress.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signLiveKitJwt, lkHttpUrl, getLiveKitEnv } from "../_shared/livekit-jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STALE_MIN = 1; // не трогаем записи моложе минуты
const MAX_PER_TICK = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const since = new Date(Date.now() - STALE_MIN * 60 * 1000).toISOString();
    const { data: stuck } = await admin
      .from("webinars")
      .select("id, organization_id, recording_status, recording_external_url, recording_egress_id, recording_ended_at, recording_started_at")
      .in("recording_status", ["processing", "stopped", "starting", "active"])
      .is("recording_url", null)
      .lt("recording_ended_at", since)
      .order("recording_ended_at", { ascending: true, nullsFirst: false })
      .limit(MAX_PER_TICK);

    const list = (stuck as any[]) ?? [];
    if (list.length === 0) {
      return json({ ok: true, processed: 0 });
    }

    const { apiKey, apiSecret, wsUrl } = getLiveKitEnv();
    const results: { id: string; ok: boolean; reason?: string }[] = [];

    for (const w of list) {
      try {
        let externalUrl: string | null = w.recording_external_url ?? null;

        // Если status='active' и Egress всё ещё активен — попытаемся остановить.
        if (w.recording_status === "active" && w.recording_egress_id) {
          try {
            const stopJwt = await signLiveKitJwt(apiKey, apiSecret, {
              video: { roomRecord: true, roomAdmin: true },
            }, 600);
            await fetch(`${lkHttpUrl(wsUrl)}/twirp/livekit.Egress/StopEgress`, {
              method: "POST",
              headers: { Authorization: `Bearer ${stopJwt}`, "Content-Type": "application/json" },
              body: JSON.stringify({ egress_id: w.recording_egress_id }),
            });
          } catch (e) {
            console.warn("[finalize] StopEgress failed", w.id, e);
          }
        }

        // Запросим URL у LiveKit
        if (!externalUrl && w.recording_egress_id) {
          const listJwt = await signLiveKitJwt(apiKey, apiSecret, {
            video: { roomRecord: true, roomAdmin: true },
          }, 600);
          const listResp = await fetch(`${lkHttpUrl(wsUrl)}/twirp/livekit.Egress/ListEgress`, {
            method: "POST",
            headers: { Authorization: `Bearer ${listJwt}`, "Content-Type": "application/json" },
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
                .update({ recording_external_url: externalUrl, recording_status: "stopped" })
                .eq("id", w.id);
            }
          }
        }

        if (!externalUrl) {
          results.push({ id: w.id, ok: false, reason: "no-url" });
          continue;
        }

        // Скачиваем
        const fileResp = await fetch(externalUrl);
        if (!fileResp.ok) {
          results.push({ id: w.id, ok: false, reason: `fetch-${fileResp.status}` });
          continue;
        }
        const blob = await fileResp.arrayBuffer();
        const sizeBytes = blob.byteLength;
        const path = `${w.organization_id}/${w.id}-${Date.now()}.mp4`;

        const { error: upErr } = await admin.storage.from("webinar-recordings")
          .upload(path, blob, { contentType: "video/mp4", upsert: true });
        if (upErr) {
          results.push({ id: w.id, ok: false, reason: `upload-${upErr.message}` });
          continue;
        }
        const { data: signed } = await admin.storage.from("webinar-recordings")
          .createSignedUrl(path, 60 * 60 * 24 * 365);

        await admin.from("webinars").update({
          recording_url: signed?.signedUrl ?? null,
          recording_size_bytes: sizeBytes,
          recording_status: "uploaded",
        }).eq("id", w.id);

        results.push({ id: w.id, ok: true });
      } catch (e) {
        console.error("[finalize] webinar", w.id, e);
        results.push({ id: w.id, ok: false, reason: (e as Error).message });
      }
    }

    return json({ ok: true, processed: list.length, results });
  } catch (e) {
    console.error("[livekit-finalize-recordings]", e);
    return json({ error: (e as Error).message || "Internal" }, 500);
  }
});

function json(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
