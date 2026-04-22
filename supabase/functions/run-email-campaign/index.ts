import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody { campaignId: string; }

const SEND_DELAY_MS = 1500;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function resolveRecipients(
  admin: ReturnType<typeof createClient>,
  campaign: any,
): Promise<Array<{ email: string; name: string }>> {
  const source: string = campaign.recipient_source;
  const orgId: string | null = campaign.organization_id;

  if (source === "manual") {
    const emails: string[] = Array.isArray(campaign.manual_emails) ? campaign.manual_emails : [];
    return emails
      .map((e) => String(e).trim().toLowerCase())
      .filter(isValidEmail)
      .map((email) => ({ email, name: "" }));
  }

  if (source === "organizations") {
    const { data } = await admin.from("organizations").select("name, email").not("email", "is", null);
    return (data || [])
      .filter((r: any) => isValidEmail(r.email))
      .map((r: any) => ({ email: String(r.email).trim().toLowerCase(), name: r.name || "" }));
  }

  if (source === "companies_db") {
    const { data } = await admin.from("sales_companies_db" as any).select("name, email").not("email", "is", null);
    return (data || [])
      .filter((r: any) => isValidEmail(r.email))
      .map((r: any) => ({ email: String(r.email).trim().toLowerCase(), name: r.name || "" }));
  }

  if (!orgId) return [];

  if (source === "students") {
    const { data } = await admin.from("profiles")
      .select("full_name, email")
      .eq("organization_id", orgId)
      .not("email", "is", null);
    return (data || [])
      .filter((r: any) => isValidEmail(r.email))
      .map((r: any) => ({ email: String(r.email).trim().toLowerCase(), name: r.full_name || "" }));
  }

  if (source === "companies") {
    const { data } = await admin.from("companies")
      .select("name, email")
      .eq("organization_id", orgId)
      .not("email", "is", null);
    return (data || [])
      .filter((r: any) => isValidEmail(r.email))
      .map((r: any) => ({ email: String(r.email).trim().toLowerCase(), name: r.name || "" }));
  }

  return [];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Авторизация (cron вызывает с service-role key — пропускаем)
    const authHeader = req.headers.get("Authorization") || "";
    const isCron = authHeader.includes(SERVICE_KEY);
    if (!isCron) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // Идемпотентность
    if (campaign.status === "sending" && campaign.started_at) {
      const startedMs = new Date(campaign.started_at).getTime();
      if (Date.now() - startedMs < 5 * 60 * 1000) {
        return new Response(JSON.stringify({
          ok: true, alreadyRunning: true,
          message: "Кампания уже отправляется (идёт фоновая обработка)",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ============ Заполнение получателей (если ещё не было) ============
    const { count: existingCount } = await admin
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);

    if ((existingCount || 0) === 0) {
      const all = await resolveRecipients(admin, campaign);

      // Дедупликация по email
      const seen = new Set<string>();
      const unique = all.filter((r) => {
        if (seen.has(r.email)) return false;
        seen.add(r.email);
        return true;
      });

      // Фильтр по suppression-листу
      const scopeKey = campaign.scope === "platform" ? "platform" : (campaign.organization_id || "platform");
      let allowed = unique;
      if (unique.length > 0) {
        const emails = unique.map((r) => r.email);
        const { data: suppRows } = await admin
          .from("email_suppressions")
          .select("email")
          .in("email", emails)
          .in("scope", [scopeKey, "platform"]);
        const suppSet = new Set((suppRows || []).map((r: any) => String(r.email).toLowerCase()));
        allowed = unique.filter((r) => !suppSet.has(r.email));
      }

      // Вставка партиями по 500
      if (allowed.length > 0) {
        const rows = allowed.map((r) => ({
          campaign_id: campaignId,
          email: r.email,
          recipient_name: r.name,
          status: "pending",
        }));
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const slice = rows.slice(i, i + BATCH);
          const { error: insErr } = await admin.from("email_campaign_recipients").insert(slice);
          if (insErr) console.error("recipients insert error", insErr);
        }
      }

      await admin.from("email_campaigns").update({
        total_recipients: allowed.length,
      }).eq("id", campaignId);
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
        ok: false, quotaExceeded: true, ...quota,
        message: `Лимит на сегодня: ${quota.daily_limit}, отправлено: ${quota.sent_today}, доступно: ${quota.remaining}. Запрошено: ${pendingCount}.`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Помечаем кампанию как sending
    await admin.from("email_campaigns").update({
      status: "sending",
      started_at: campaign.started_at || new Date().toISOString(),
    }).eq("id", campaignId);

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

      const { data: leftovers } = await admin.from("email_campaign_recipients")
        .select("id").eq("campaign_id", campaignId).eq("status", "pending");
      const leftCount = leftovers?.length || 0;
      await admin.from("email_campaigns").update({
        status: leftCount === 0 ? "completed" : "paused",
        completed_at: leftCount === 0 ? new Date().toISOString() : null,
      }).eq("id", campaignId);
    })();

    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runner);
    }

    return new Response(JSON.stringify({ ok: true, started: pendingCount, quota }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("run-email-campaign error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
