import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function b64(s: string): string { return btoa(unescape(encodeURIComponent(s))); }
function encSubject(s: string): string { return `=?UTF-8?B?${b64(s)}?=`; }
function encFrom(from: string): string {
  const m = from.match(/^(.+?)\s*<(.+)>$/);
  return m ? `=?UTF-8?B?${b64(m[1].trim())}?= <${m[2].trim()}>` : from;
}

async function sendSmtp(to: string, subject: string, html: string): Promise<boolean> {
  const SMTP_HOST = Deno.env.get("SMTP_HOST");
  const SMTP_PORT = Deno.env.get("SMTP_PORT");
  const SMTP_USER = Deno.env.get("SMTP_USER");
  const SMTP_PASS = Deno.env.get("SMTP_PASS");
  const SMTP_FROM = Deno.env.get("SMTP_FROM");
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    console.error("SMTP not configured");
    return false;
  }
  try {
    const encHtml = b64(html);
    const raw = [
      `From: ${encFrom(SMTP_FROM)}`,
      `To: ${to}`,
      `Subject: ${encSubject(subject)}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      encHtml.match(/.{1,76}/g)?.join("\r\n") || encHtml,
    ].join("\r\n");

    const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: parseInt(SMTP_PORT, 10) });
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const read = async () => {
      const buf = new Uint8Array(2048);
      const n = await conn.read(buf);
      return n === null ? "" : dec.decode(buf.subarray(0, n));
    };
    const cmd = async (c: string) => { await conn.write(enc.encode(c + "\r\n")); return await read(); };
    await read();
    await cmd("EHLO localhost");
    await cmd("AUTH LOGIN");
    await cmd(btoa(SMTP_USER));
    await cmd(btoa(SMTP_PASS));
    const fromEmail = (SMTP_FROM.match(/<([^>]+)>/) || [null, SMTP_FROM])[1] || SMTP_FROM;
    await cmd(`MAIL FROM:<${fromEmail}>`);
    await cmd(`RCPT TO:<${to}>`);
    await cmd("DATA");
    await conn.write(enc.encode(raw + "\r\n.\r\n"));
    await read();
    await cmd("QUIT");
    conn.close();
    return true;
  } catch (e) {
    console.error("SMTP error:", e);
    return false;
  }
}

function buildEmailHtml(orgName: string, recipientName: string, docTitle: string, signUrl: string, expiresAt: string, isReminder = false) {
  const exp = new Date(expiresAt).toLocaleDateString("ru-RU");
  const headerLabel = isReminder ? "🔔 Напоминание о подписании" : "📝 Документ на подписание";
  const introLine = isReminder
    ? `Напоминаем: организация <strong>${orgName}</strong> ранее направила вам документ для подписания, который пока не подписан:`
    : `Организация <strong>${orgName}</strong> направила вам документ для подписания простой электронной подписью:`;
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f7fa;margin:0;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#14b8a6,#0891b2);color:#fff;padding:12px 24px;border-radius:8px;font-weight:bold;font-size:18px;">${headerLabel}</div>
    </div>
    <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Здравствуйте, ${recipientName}!</h2>
    <p style="color:#444;font-size:15px;line-height:1.6;">${introLine}</p>
    <div style="background:#f0fdfa;border-left:4px solid #14b8a6;padding:14px 18px;margin:20px 0;border-radius:6px;">
      <strong style="color:#0f766e;">${docTitle}</strong>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${signUrl}" style="display:inline-block;background:linear-gradient(135deg,#14b8a6,#0891b2);color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Открыть и подписать</a>
    </div>
    <p style="color:#888;font-size:13px;text-align:center;">Ссылка действительна до <strong>${exp}</strong></p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="color:#999;font-size:12px;line-height:1.5;">Подписание происходит в соответствии с Федеральным законом 63-ФЗ «Об электронной подписи». Перед подписанием вам будет предложено ознакомиться с Соглашением о ПЭП. Если вы получили это письмо по ошибке — просто проигнорируйте его.</p>
  </div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const signatureId = body.signatureId || body.signature_id;
    const isReminder = !!(body.isReminder || body.is_reminder);
    if (!signatureId) {
      return new Response(JSON.stringify({ error: "signatureId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sig, error } = await supabase
      .from("document_signatures")
      .select("id, document_title, recipient_email, recipient_name, signature_token, expires_at, organization_id, sent_at")
      .eq("id", signatureId)
      .maybeSingle();

    if (error || !sig) {
      return new Response(JSON.stringify({ error: "Signature not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", sig.organization_id)
      .maybeSingle();

    const APP_URL = Deno.env.get("APP_URL") || "https://синтагма.рф";
    const signUrl = `${APP_URL}/sign/${sig.signature_token}`;
    const html = buildEmailHtml(org?.name || "Организация", sig.recipient_name, sig.document_title, signUrl, sig.expires_at, isReminder);

    const subjectPrefix = isReminder ? "Напоминание о подписании" : "Документ на подписание";
    const ok = await sendSmtp(sig.recipient_email, `${subjectPrefix}: ${sig.document_title}`, html);

    if (ok && !isReminder) {
      // Только при первой отправке выставляем статус и sent_at; при напоминании сохраняем исходную метку.
      await supabase
        .from("document_signatures")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", signatureId);
    }

    return new Response(JSON.stringify({ success: ok, reminder: isReminder }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
