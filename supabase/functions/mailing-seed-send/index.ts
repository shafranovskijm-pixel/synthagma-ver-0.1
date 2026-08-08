// Этап 3 (P0-hardened) — seed-отправка письма кампании на 1–5 вручную введённых
// адресов.
//
// Контракт: { campaign_id, sender_id, seed_emails[1..5] }.
// Тема и HTML читаются ТОЛЬКО из БД по campaign_id; любые subject/html из тела
// запроса игнорируются. База получателей кампании не читается никогда.
// Квота/кулдаун резервируются атомарно на сервере (advisory lock в RPC).
// Пароль отправителя не возвращается, не логируется и не попадает в журнал.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_SEED = 5;
const COOLDOWN_SECONDS = 60;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const campaignId = typeof body?.campaign_id === "string" ? body.campaign_id : "";
    const senderId = typeof body?.sender_id === "string" ? body.sender_id : "";
    const rawSeeds: unknown = body?.seed_emails;
    if (!campaignId || !senderId) return json({ error: "campaign_id, sender_id required" }, 400);

    const seeds = Array.isArray(rawSeeds)
      ? Array.from(
          new Set(
            rawSeeds
              .filter((e): e is string => typeof e === "string")
              .map((e) => e.trim().toLowerCase())
              .filter((e) => EMAIL_RE.test(e)),
          ),
        )
      : [];
    if (seeds.length < 1 || seeds.length > MAX_SEED) {
      return json({ error: `Нужно от 1 до ${MAX_SEED} корректных seed-адресов` }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Отправитель: организация и служебный статус читаются с сервера.
    const { data: sender } = await admin
      .from("mailing_senders")
      .select("id, organization_id, smtp_status, is_active")
      .eq("id", senderId)
      .maybeSingle();
    if (!sender) return json({ error: "Forbidden" }, 403);

    // Кампания: тема/тело/отправитель — только из БД.
    const { data: campaign } = await admin
      .from("email_campaigns")
      .select("id, organization_id, subject, html_body, from_name, reply_to")
      .eq("id", campaignId)
      .maybeSingle();
    if (!campaign) return json({ error: "Forbidden" }, 403);

    // Кампания и отправитель обязаны принадлежать одной организации.
    if (!campaign.organization_id || campaign.organization_id !== sender.organization_id) {
      return json({ error: "Forbidden" }, 403);
    }

    // Вызывающий обязан иметь доступ к этой организации (или быть админом).
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: u.user.id,
      _role: "admin",
    });
    let allowed = !!isAdmin;
    if (!allowed) {
      const { data: canAccess } = await userClient.rpc("can_access_organization", {
        _organization_id: sender.organization_id,
        _permission: "email.manage",
      });
      allowed = !!canAccess;
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    const subject = (campaign.subject || "").trim();
    const html = campaign.html_body || "";
    if (!subject || !html) return json({ success: false, error_category: "campaign_incomplete" }, 200);

    // Seed-отправка разрешена только после успешного SMTP-теста, который
    // выставляет service_role (клиент не может писать smtp_status).
    if (sender.smtp_status !== "ok" || sender.is_active !== true) {
      return json({ success: false, error_category: "smtp_not_tested" }, 200);
    }

    // Атомарное резервирование квоты + кулдаун (advisory lock внутри RPC).
    const { data: reserveRows, error: reserveErr } = await admin.rpc("reserve_mailing_seed_quota", {
      p_sender_id: senderId,
      p_campaign_id: campaignId,
      p_count: seeds.length,
      p_requested_by: u.user.id,
      p_cooldown_seconds: COOLDOWN_SECONDS,
    });
    const reservation = Array.isArray(reserveRows) ? reserveRows[0] : reserveRows;
    if (reserveErr || !reservation?.allowed) {
      return json(
        { success: false, error_category: reservation?.reason || "quota", remaining: reservation?.remaining ?? 0 },
        200,
      );
    }
    const ledgerId = reservation.ledger_id as string;

    const { data: rows, error: secretErr } = await admin.rpc("get_mailing_sender_secret", {
      p_sender_id: senderId,
    });
    const cfg = Array.isArray(rows) ? rows[0] : rows;
    if (secretErr || !cfg?.secret) {
      await admin.rpc("record_mailing_seed_result", {
        p_ledger_id: ledgerId,
        p_sent: 0,
        p_failed: seeds.length,
      });
      return json({ success: false, error_category: "config" }, 200);
    }

    // Имя организации для переменных organization/org_name (best effort).
    let orgName = "";
    try {
      const { data: org } = await admin
        .from("organizations")
        .select("name")
        .eq("id", sender.organization_id)
        .maybeSingle();
      orgName = (org?.name as string) || "";
    } catch { /* не критично */ }

    const fromName = campaign.from_name || cfg.from_name || "СИНТАГМА";
    const seedUnsubscribe = buildSeedUnsubscribeMailto(cfg.from_email);

    let sent = 0;
    let failed = 0;
    for (const to of seeds) {
      try {
        // Все поддерживаемые переменные подставляются детерминированно:
        // ни один {{token}} не должен уйти в письмо (unresolved → "").
        const values = buildSeedVariableValues({
          seedEmail: to,
          organizationName: orgName,
          fromName,
          fromEmail: cfg.from_email,
          unsubscribeUrl: seedUnsubscribe,
        });
        const seedSubject = renderMailingTemplate(subject, values, {
          escapeHtml: false,
          unresolved: "strip",
        });
        const seedHtml = renderMailingTemplate(html, values, { unresolved: "strip" });

        await sendSmtpEmail(
          {
            host: cfg.smtp_host,
            port: cfg.smtp_port,
            username: cfg.smtp_username,
            password: cfg.secret,
            encryption: (cfg.smtp_security || "ssl") === "starttls" ? "starttls" : "ssl",
            from_email: cfg.from_email,
            from_name: fromName,
          } as never,
          {
            to,
            subject: `[SEED] ${seedSubject}`,
            html: seedHtml,
            extraHeaders: buildListUnsubscribeHeaders({
              unsubscribeUrl: seedUnsubscribe,
              fromEmail: cfg.from_email,
            }),
          },
        );
        sent += 1;
      } catch {
        failed += 1;
      }
    }


    // В журнал пишутся только счётчики: ни тела письма, ни пароля.
    await admin.rpc("record_mailing_seed_result", {
      p_ledger_id: ledgerId,
      p_sent: sent,
      p_failed: failed,
    });

    return json({ success: failed === 0, sent, failed }, 200);
  } catch {
    return json({ success: false, error_category: "unknown" }, 200);
  }
});
