import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody { campaignId: string; }

const SEND_DELAY_MS = 1500;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Проверка авторизации
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { campaignId }: ReqBody = await req.json();
    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaignId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign, error: cErr } = await admin
      .from("email_campaigns").select("*").eq("id", campaignId).single();
    if (cErr || !campaign) {
      return new Response(JSON.stringify({ error: "Кампания не найдена" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Идемпотентность: если кампания уже sending и started_at < 5 минут назад,
    // не запускаем второй раннер (защита от дубль-кликов и дубль-вызовов).
    if (campaign.status === "sending" && campaign.started_at) {
      const startedMs = new Date(campaign.started_at).getTime();
      if (Date.now() - startedMs < 5 * 60 * 1000) {
        return new Response(JSON.stringify({
          ok: true,
          alreadyRunning: true,
          message: "Кампания уже отправляется (идёт фоновая обработка)",
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Если sending старше 5 минут — считаем зависшей, перезапускаем.
    }

    // Получатели в статусе pending
    const { data: pending } = await admin
      .from("email_campaign_recipients")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("status", "pending");

    const pendingCount = pending?.length || 0;
    if (pendingCount === 0) {
      await admin.from("email_campaigns").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", campaignId);
      return new Response(JSON.stringify({ ok: true, message: "Нет получателей в очереди" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Проверяем квоту
    const scopeKey = campaign.scope === "platform" ? "platform" : campaign.organization_id;
    const { data: quota, error: qErr } = await admin.rpc("consume_email_quota", {
      p_scope_key: scopeKey,
      p_count: pendingCount,
    });
    if (qErr) {
      return new Response(JSON.stringify({ error: "Ошибка квоты: " + qErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (quota && quota.allowed === false) {
      return new Response(JSON.stringify({
        ok: false,
        quotaExceeded: true,
        ...quota,
        message: `Лимит на сегодня: ${quota.daily_limit}, отправлено: ${quota.sent_today}, доступно: ${quota.remaining}. Запрошено: ${pendingCount}.`,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Помечаем кампанию как sending
    await admin.from("email_campaigns").update({
      status: "sending",
      started_at: campaign.started_at || new Date().toISOString(),
    }).eq("id", campaignId);

    // Запускаем отправку в фоне (не блокируем ответ)
    const runner = (async () => {
      for (const r of pending!) {
        try {
          await admin.functions.invoke("send-campaign-email", {
            body: { campaignId, recipientId: r.id },
          });
        } catch (e) {
          console.error("invoke send-campaign-email failed", e);
        }
        await new Promise((res) => setTimeout(res, SEND_DELAY_MS));
      }

      // Финализируем
      const { data: leftovers } = await admin.from("email_campaign_recipients")
        .select("id").eq("campaign_id", campaignId).eq("status", "pending");
      const leftCount = leftovers?.length || 0;
      await admin.from("email_campaigns").update({
        status: leftCount === 0 ? "completed" : "paused",
        completed_at: leftCount === 0 ? new Date().toISOString() : null,
      }).eq("id", campaignId);
    })();

    // EdgeRuntime.waitUntil if available, otherwise just fire-and-forget
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runner);
    }

    return new Response(JSON.stringify({
      ok: true,
      started: pendingCount,
      quota,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("run-email-campaign error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
