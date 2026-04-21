import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, type SmtpConfig } from "../_shared/smtp-sender.ts";

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

    // Подставляем трекинг-пиксель в HTML
    const trackUrl = `${SUPABASE_URL}/functions/v1/track-email-open?t=${recipient.open_token}`;
    const htmlWithPixel = campaign.html_body
      + `<img src="${trackUrl}" width="1" height="1" alt="" style="display:none" />`;

    // Подставляем имя получателя в шаблон
    const personalizedHtml = htmlWithPixel
      .replace(/\{\{name\}\}/g, recipient.recipient_name || "")
      .replace(/\{\{recipient_name\}\}/g, recipient.recipient_name || "")
      .replace(/\{\{email\}\}/g, recipient.email)
      .replace(/\{\{company\}\}/g, recipient.recipient_name || "");

    const fromOverride = campaign.from_name
      ? `${campaign.from_name} <${smtp.from_email}>`
      : undefined;

    await sendSmtpEmail(smtp, {
      to: recipient.email,
      subject: campaign.subject,
      html: personalizedHtml,
      fromOverride,
      replyTo: campaign.reply_to || undefined,
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
