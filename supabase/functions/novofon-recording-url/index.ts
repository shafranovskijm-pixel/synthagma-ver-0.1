import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { describeNovofonError, novofonDataRpc, novofonRequest } from "../_shared/novofon.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function sqlDateTime(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type CallsReportRow = {
  id?: number;
  finish_reason?: string | null;
  talk_duration?: number | null;
  total_duration?: number | null;
  call_records?: string[] | null;
  wav_call_records?: string[] | null;
  full_record_file_link?: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "auth required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return new Response("unauthorized", { status: 401, headers: corsHeaders });

    const { call_log_id } = await req.json();
    if (!call_log_id) {
      return new Response(JSON.stringify({ error: "call_log_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: log } = await admin
      .from("call_logs")
      .select("id, novofon_call_id, recording_url, started_at")
      .eq("id", call_log_id)
      .maybeSingle();

    if (!log) return new Response("not found", { status: 404, headers: corsHeaders });

    // если у нас уже есть прямой URL — вернём
    if (log.recording_url && log.recording_url.startsWith("http")) {
      // фиксируем факт прослушивания
      await admin.from("call_log_listens").insert({
        call_log_id: log.id, listener_user_id: user.id,
      });
      return new Response(JSON.stringify({ url: log.recording_url }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!log.novofon_call_id) {
      return new Response(JSON.stringify({ error: "no recording" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const base = log.started_at ? new Date(log.started_at) : new Date();
      const from = new Date(base.getTime() - 36 * 60 * 60 * 1000);
      const till = new Date(Math.max(Date.now(), base.getTime()) + 36 * 60 * 60 * 1000);
      const rows = await novofonDataRpc<CallsReportRow[]>("get.calls_report", {
        date_from: sqlDateTime(from),
        date_till: sqlDateTime(till),
        include_ongoing_calls: true,
        limit: 1,
        filter: { field: "id", operator: "=", value: Number(log.novofon_call_id) },
        fields: ["id", "finish_reason", "talk_duration", "total_duration", "call_records", "wav_call_records", "full_record_file_link"],
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      const url = row?.full_record_file_link
        || (row?.call_records?.[0] ? `https://media.novofon.ru/${log.novofon_call_id}/${row.call_records[0]}` : null);

      if (row) {
        await admin.from("call_logs").update({
          status: row.talk_duration && row.talk_duration > 0 ? "completed" : "no_answer",
          duration_sec: row.talk_duration ?? row.total_duration ?? null,
          ended_at: new Date().toISOString(),
          has_recording: Boolean(url),
          recording_url: url,
          notes: row.finish_reason ? `Novofon: ${row.finish_reason}` : undefined,
        }).eq("id", log.id);
      }

      if (url) {
        await admin.from("call_log_listens").insert({
          call_log_id: log.id, listener_user_id: user.id,
        });
        return new Response(JSON.stringify({ url }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (dataApiError) {
      console.warn("Novofon Data API recording lookup failed:", describeNovofonError(dataApiError));

      const nfRes = await novofonRequest<{ status: string; link?: string; lifetime?: number }>(
        "GET",
        "/v1/pbx/record/request/",
        { call_id: log.novofon_call_id, lifetime: 3600 },
      );

      if (nfRes.status === "success" && nfRes.link) {
        await admin.from("call_logs").update({ has_recording: true, recording_url: nfRes.link }).eq("id", log.id);
        await admin.from("call_log_listens").insert({
          call_log_id: log.id, listener_user_id: user.id,
        });
        return new Response(JSON.stringify({ url: nfRes.link }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "recording not available" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("novofon-recording-url error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
