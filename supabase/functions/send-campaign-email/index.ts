import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, type SmtpConfig, type Attachment } from "../_shared/smtp-sender.ts";
import { buildIcs } from "../_shared/ics.ts";
import { processCampaignHtml } from "../_shared/email-html-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody { campaignId: string; recipientId: string; }

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let recipientId: string | null = null;
  let campaignId: string | null = null;

  try {
    const body: ReqBody = await req.json();
    recipientId = body.recipientId;
    campaignId = body.campaignId;
    if (!recipientId || !campaignId) {
      return new Response(JSON.stringify({ error: "campaignId & recipientId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign, error: cErr } = await admin
      .from("email_campaigns").select("*").eq("id", campaignId).single();
    if (cErr || !campaign) throw new Error("Кампания не найдена");

    const { data: recipient, error: rErr } = await admin
      .from("email_campaign_recipients").select("*").eq("id", recipientId).single();
    if (rErr || !recipient) throw new Error("Получатель не найден");

    // ============ Suppression check ============
    const scopeKey = campaign.scope === "platform" ? "platform" : (campaign.organization_id || "platform");
    const { data: isSupp } = await admin.rpc("is_email_suppressed", {
      p_email: recipient.email,
      p_scope: scopeKey,
    });
    if (isSupp === true) {
      await admin.from("email_campaign_recipients").update({
        status: "failed",
        error: "Адрес в списке отписавшихся",
      }).eq("id", recipientId);
      const { data: c2 } = await admin.from("email_campaigns")
        .select("failed_count").eq("id", campaignId).single();
      await admin.from("email_campaigns").update({
        failed_count: (c2?.failed_count || 0) + 1,
      }).eq("id", campaignId);
      return new Response(JSON.stringify({ success: false, suppressed: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Получаем SMTP-конфигурацию
    let smtp: SmtpConfig;
    if (campaign.scope === "platform") {
      const host = Deno.env.get("SMTP_HOST");
      const port = Deno.env.get("SMTP_PORT");
      const user = Deno.env.get("SMTP_USER");
      const pass = Deno.env.get("SMTP_PASS");
      const fromEnv = Deno.env.get("SMTP_FROM") || "noreply@sintagma.com.ru";
      if (!host || !port || !user || !pass) throw new Error("Платформенный SMTP не настроен");
      // Парсим SMTP_FROM, который может быть "Имя <email>"
      const m = fromEnv.match(/^(.+?)\s*<(.+)>$/);
      smtp = {
        host, port: parseInt(port, 10), username: user, password: pass,
        encryption: parseInt(port, 10) === 465 ? "ssl" : "starttls",
        from_email: m ? m[2].trim() : fromEnv,
        from_name: m ? m[1].trim() : (campaign.from_name || "Sintagma"),
      };
    } else {
      // org-scope: расшифровываем SMTP организации
      const { data: smtpRow, error: smErr } = await admin.rpc("get_decrypted_org_smtp", {
        p_organization_id: campaign.organization_id,
      });
      if (smErr) throw new Error("Ошибка получения SMTP: " + smErr.message);
      const row = (smtpRow || [])[0];
      if (!row) throw new Error("SMTP организации не настроен");
      smtp = {
        host: row.host, port: row.port, username: row.username, password: row.password,
        encryption: row.encryption,
        from_email: row.from_email, from_name: row.from_name,
      };
    }

    const meeting = (campaign.recipient_filter as any)?.meeting || null;
    const dateLabel = meeting?.scheduled_at
      ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(meeting.scheduled_at))
      : "";
    const timeLabel = meeting?.scheduled_at
      ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(meeting.scheduled_at))
      : "";

    const unsubscribeUrl = `${SUPABASE_URL}/functions/v1/email-unsubscribe?t=${recipient.open_token}`;
    const trackUrl = `${SUPABASE_URL}/functions/v1/track-email-open?t=${recipient.open_token}`;

    // ============ Расширенные переменные {{org_name}}, {{plan}}, {{course_count}}, {{last_login}} ============
    let orgName = "";
    let plan = "";
    let courseCount = "";
    let lastLogin = "";

    // Если получатель — организация (по email), пробуем подтянуть инфу
    try {
      const { data: orgRow } = await admin
        .from("organizations")
        .select("id, name, subscription_plan, subscription_plans:subscription_plan(name)")
        .eq("email", recipient.email)
        .maybeSingle();
      if (orgRow) {
        orgName = (orgRow as any).name || "";
        plan = (orgRow as any).subscription_plan || "";
        const { count: cc } = await admin
          .from("courses")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", (orgRow as any).id);
        if (cc !== null && cc !== undefined) courseCount = String(cc);
      }
    } catch (_) { /* optional */ }

    // last_login через профиль (если email совпадает)
    try {
      const { data: prof } = await admin
        .from("profiles")
        .select("last_sign_in_at, organization_id")
        .eq("email", recipient.email)
        .maybeSingle();
      if (prof?.last_sign_in_at) {
        lastLogin = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
          .format(new Date(prof.last_sign_in_at));
      }
      if (!orgName && (prof as any)?.organization_id) {
        const { data: o2 } = await admin.from("organizations")
          .select("name, subscription_plan").eq("id", (prof as any).organization_id).maybeSingle();
        if (o2) {
          orgName = (o2 as any).name || orgName;
          if (!plan) plan = (o2 as any).subscription_plan || "";
        }
      }
    } catch (_) { /* optional */ }

    // Выбор темы по A/B-варианту
    const variant = (recipient as any).subject_variant as ("a" | "b" | null) || null;
    const subject = (variant === "b" && campaign.subject_b)
      ? campaign.subject_b
      : campaign.subject;

    let personalizedHtml = (campaign.html_body as string)
      .replace(/\{\{name\}\}/g, recipient.recipient_name || "")
      .replace(/\{\{recipient_name\}\}/g, recipient.recipient_name || "")
      .replace(/\{\{email\}\}/g, recipient.email)
      .replace(/\{\{company\}\}/g, recipient.recipient_name || "")
      .replace(/\{\{org_name\}\}/g, orgName)
      .replace(/\{\{plan\}\}/g, plan)
      .replace(/\{\{course_count\}\}/g, courseCount)
      .replace(/\{\{last_login\}\}/g, lastLogin)
      .replace(/\{\{webinar_url\}\}/g, meeting?.url || "")
      .replace(/\{\{date\}\}/g, dateLabel)
      .replace(/\{\{time\}\}/g, timeLabel)
      .replace(/\{\{host_name\}\}/g, meeting?.host_name || campaign.from_name || "")
      .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl);

    personalizedHtml = processCampaignHtml(personalizedHtml, {
      campaignId: campaign.id,
      campaignName: campaign.name,
      recipientToken: recipient.open_token,
      supabaseUrl: SUPABASE_URL,
      utmEnabled: campaign.utm_enabled !== false,
      trackClicks: true,
      unsubscribeUrl,
      fromEmail: smtp.from_email,
    });

    personalizedHtml += `<img src="${trackUrl}" width="1" height="1" alt="" style="display:none" />`;

    // iCal-приглашение, если включено и есть meeting с датой
    const attachments: Attachment[] = [];
    if (meeting?.attach_ics && meeting?.scheduled_at && meeting?.url) {
      const ics = buildIcs({
        uid: `${campaignId}-${recipientId}@sintagma.com.ru`,
        title: meeting.title || campaign.subject || "Презентация Sintagma",
        description: `Ссылка на встречу: ${meeting.url}`,
        url: meeting.url,
        startISO: meeting.scheduled_at,
        durationMinutes: meeting.duration_minutes || 60,
        organizerEmail: smtp.from_email,
        organizerName: meeting.host_name || campaign.from_name || smtp.from_name || undefined,
        attendeeEmail: recipient.email,
      });
      attachments.push({
        filename: "invite.ics",
        content: ics,
        contentType: "text/calendar; method=REQUEST; charset=UTF-8",
      });
    }

    const fromOverride = campaign.from_name
      ? `${campaign.from_name} <${smtp.from_email}>`
      : undefined;

    await sendSmtpEmail(smtp, {
      to: recipient.email,
      subject: campaign.subject,
      html: personalizedHtml,
      fromOverride,
      replyTo: campaign.reply_to || undefined,
      attachments: attachments.length ? attachments : undefined,
      extraHeaders: {
        "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${smtp.from_email}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "Precedence": "bulk",
      },
    });

    // Помечаем как отправленное
    await admin.from("email_campaign_recipients").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error: null,
    }).eq("id", recipientId);

    // Инкрементируем sent_count в кампании
    const { data: c2 } = await admin.from("email_campaigns")
      .select("sent_count").eq("id", campaignId).single();
    await admin.from("email_campaigns").update({
      sent_count: (c2?.sent_count || 0) + 1,
    }).eq("id", campaignId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("send-campaign-email error", msg);

    if (recipientId) {
      try {
        await admin.from("email_campaign_recipients").update({
          status: "failed", error: msg,
        }).eq("id", recipientId);
        if (campaignId) {
          const { data: c2 } = await admin.from("email_campaigns")
            .select("failed_count").eq("id", campaignId).single();
          await admin.from("email_campaigns").update({
            failed_count: (c2?.failed_count || 0) + 1,
          }).eq("id", campaignId);
        }
      } catch (_) { /* ignore */ }
    }

    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, // мягкая ошибка — воркер продолжает
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
