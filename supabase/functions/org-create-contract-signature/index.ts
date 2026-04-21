import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, type SmtpConfig } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  organization_id: string;
  document_title: string;
  document_html: string;
  recipient_name: string;
  recipient_email: string;
  expires_days?: number;
  template_email_id?: string | null;
  linked_proposal_id?: string | null;
}

function renderEmailHtml(orgName: string, recipientName: string, docTitle: string, signUrl: string, expiresAt: string, customHtml?: string, customSubject?: string) {
  const exp = new Date(expiresAt).toLocaleDateString("ru-RU");
  if (customHtml) {
    return customHtml
      .replace(/\{\{recipient_name\}\}/g, recipientName)
      .replace(/\{\{document_title\}\}/g, docTitle)
      .replace(/\{\{signing_url\}\}/g, signUrl)
      .replace(/\{\{sender_name\}\}/g, orgName)
      .replace(/\{\{expires_at\}\}/g, exp);
  }
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f7fa;margin:0;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Здравствуйте, ${recipientName}!</h2>
    <p style="color:#444;font-size:15px;line-height:1.6;">Организация <strong>${orgName}</strong> направила вам договор для подписания:</p>
    <div style="background:#f0fdfa;border-left:4px solid #14b8a6;padding:14px 18px;margin:20px 0;border-radius:6px;">
      <strong style="color:#0f766e;">${docTitle}</strong>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${signUrl}" style="display:inline-block;background:linear-gradient(135deg,#14b8a6,#0891b2);color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Открыть и подписать</a>
    </div>
    <p style="color:#888;font-size:13px;text-align:center;">Ссылка действительна до <strong>${exp}</strong></p>
  </div></body></html>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: ReqBody = await req.json();
    if (!body.organization_id || !body.document_title || !body.document_html || !body.recipient_email || !body.recipient_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Получаем имя отправителя
    const { data: profile } = await admin.from("profiles").select("full_name, email").eq("user_id", user.id).maybeSingle();
    const senderName = profile?.full_name || profile?.email || "Организация";

    // 2. Создаём запись подписи + первая ревизия (HTML договора храним в document_html)
    const expiresAt = new Date(Date.now() + (body.expires_days ?? 14) * 86400000).toISOString();
    const { data: sig, error: sigErr } = await admin.from("document_signatures").insert({
      organization_id: body.organization_id,
      sender_user_id: user.id,
      sender_name: senderName,
      document_type: "sales_contract",
      document_title: body.document_title,
      document_html: body.document_html,
      recipient_type: "external_company",
      recipient_email: body.recipient_email,
      recipient_name: body.recipient_name,
      status: "draft",
      mode: "review",
      requires_bilateral: true,
      expires_at: expiresAt,
      linked_proposal_id: body.linked_proposal_id ?? null,
    }).select("id, signature_token, email_open_token").single();
    if (sigErr || !sig) throw new Error("Не удалось создать подпись: " + (sigErr?.message || "unknown"));

    // 3. Первая ревизия
    const { data: rev, error: revErr } = await admin.from("signature_revisions").insert({
      signature_id: sig.id,
      version: 1,
      document_html: body.document_html,
      created_by: user.id,
      created_by_name: senderName,
      change_summary: "Первоначальная версия договора",
    }).select("id").single();
    if (revErr || !rev) throw new Error("Не удалось создать ревизию: " + (revErr?.message || "unknown"));

    await admin.from("document_signatures").update({
      current_revision_id: rev.id,
    }).eq("id", sig.id);

    // 4. Готовим SMTP организации
    const { data: smtpRow, error: smErr } = await admin.rpc("get_decrypted_org_smtp", {
      p_organization_id: body.organization_id,
    });
    if (smErr) throw new Error("Ошибка SMTP: " + smErr.message);
    const row = (smtpRow || [])[0];
    if (!row) throw new Error("SMTP организации не настроен. Перейдите в «Продажи → SMTP».");

    const smtp: SmtpConfig = {
      host: row.host, port: row.port, username: row.username, password: row.password,
      encryption: row.encryption, from_email: row.from_email, from_name: row.from_name,
    };

    // 5. Загружаем HTML шаблона письма (если выбран)
    let templateHtml: string | undefined;
    let templateSubject: string | undefined;
    if (body.template_email_id) {
      const { data: tpl } = await admin.from("email_templates").select("subject, html_body").eq("id", body.template_email_id).maybeSingle();
      if (tpl) {
        templateHtml = tpl.html_body;
        templateSubject = tpl.subject;
      }
    }

    // 6. Получаем имя организации
    const { data: org } = await admin.from("organizations").select("name").eq("id", body.organization_id).maybeSingle();
    const orgName = org?.name || senderName;

    // 7. Формируем письмо
    const APP_URL = Deno.env.get("APP_URL") || "https://синтагма.рф";
    const signUrl = `${APP_URL}/sign/${sig.signature_token}`;
    const trackUrl = `${SUPABASE_URL}/functions/v1/track-email-open?purpose=signing&t=${sig.email_open_token}`;
    let html = renderEmailHtml(orgName, body.recipient_name, body.document_title, signUrl, expiresAt, templateHtml);
    html += `<img src="${trackUrl}" width="1" height="1" alt="" style="display:none" />`;
    const subject = (templateSubject || `Документ на подписание: ${body.document_title}`)
      .replace(/\{\{document_title\}\}/g, body.document_title)
      .replace(/\{\{recipient_name\}\}/g, body.recipient_name);

    // 8. Отправляем
    await sendSmtpEmail(smtp, { to: body.recipient_email, subject, html });

    // 9. Помечаем как отправленный
    await admin.from("document_signatures").update({
      status: "sent",
      sent_at: new Date().toISOString(),
    }).eq("id", sig.id);

    // 10. Списываем квоту (skip_warmup для транзакционных)
    await admin.rpc("consume_email_quota", {
      p_scope_key: "org:" + body.organization_id,
      p_count: 1,
      p_skip_warmup: true,
    });

    return new Response(JSON.stringify({ signature_id: sig.id, signing_url: signUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("org-create-contract-signature error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
