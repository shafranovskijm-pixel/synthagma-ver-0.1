import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, type SmtpConfig } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SAMPLE: Record<string, string> = {
  "{{name}}": "Иван Иванов",
  "{{email}}": "test@example.com",
  "{{company}}": "ООО Ромашка",
  "{{proposal_url}}": "https://example.com/proposal/demo",
  "{{signing_url}}": "https://example.com/sign/demo",
  "{{document_title}}": "Договор оказания услуг №1",
  "{{sender_name}}": "Менеджер",
};

function render(html: string, vars: Record<string, string>): string {
  let h = html;
  for (const [k, v] of Object.entries(vars)) h = h.split(k).join(v);
  return h;
}

async function sendWithTimeout(smtp: SmtpConfig, opts: { to: string; subject: string; html: string }, timeoutMs = 25_000) {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`SMTP timeout (${Math.round(timeoutMs / 1000)}s)`)), timeoutMs);
  });

  await Promise.race([
    sendSmtpEmail(smtp, opts),
    timeout,
  ]);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let admin: ReturnType<typeof createClient> | null = null;
  let senderPoolEmail: string | null = null;

  try {
    const { template_id, to_email, scope, organization_id, mode, variables, to_name, sender_email } = await req.json();
    if (!template_id || !to_email) {
      return new Response(JSON.stringify({ error: "template_id и to_email обязательны" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const isSingle = mode === "single";

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tpl, error: tErr } = await admin
      .from("email_templates").select("*").eq("id", template_id).single();
    if (tErr || !tpl) throw new Error("Шаблон не найден");

    let smtp: SmtpConfig;
    if (sender_email) {
      const { data: s, error: se } = await admin
        .from("email_sender_pool")
        .select("email,app_password,host,port,encryption,from_name,is_active")
        .eq("email", sender_email)
        .maybeSingle();
      if (se || !s) throw new Error("Отправитель не найден в пуле: " + sender_email);
      if (!s.is_active) throw new Error("Отправитель отключён: " + sender_email);
      smtp = {
        host: s.host, port: s.port, username: s.email, password: s.app_password,
        encryption: s.encryption, from_email: s.email, from_name: s.from_name || "Синтагма",
      };
      senderPoolEmail = s.email;
    } else if (scope === "org" && organization_id) {
      const { data: smtpRow, error: smErr } = await admin.rpc("get_decrypted_org_smtp", {
        p_organization_id: organization_id,
      });
      if (smErr) throw new Error("Ошибка получения SMTP: " + smErr.message);
      const row = (smtpRow || [])[0];
      if (!row) throw new Error("SMTP организации не настроен");
      smtp = {
        host: row.host, port: row.port, username: row.username, password: row.password,
        encryption: row.encryption, from_email: row.from_email, from_name: row.from_name,
      };
    } else {
      const host = Deno.env.get("SMTP_HOST");
      const port = Deno.env.get("SMTP_PORT");
      const user = Deno.env.get("SMTP_USER");
      const pass = Deno.env.get("SMTP_PASS");
      const fromEnv = Deno.env.get("SMTP_FROM") || "noreply@sintagma.com.ru";
      if (!host || !port || !user || !pass) throw new Error("Платформенный SMTP не настроен");
      const m = fromEnv.match(/^(.+?)\s*<(.+)>$/);
      smtp = {
        host, port: parseInt(port, 10), username: user, password: pass,
        encryption: parseInt(port, 10) === 465 ? "ssl" : "starttls",
        from_email: m ? m[2].trim() : fromEnv,
        from_name: m ? m[1].trim() : "Sintagma",
      };
    }

    const userVars: Record<string, string> = {};
    if (variables && typeof variables === "object") {
      for (const [k, v] of Object.entries(variables)) {
        if (v == null) continue;
        userVars[`{{${k}}}`] = String(v);
      }
    }
    if (to_name) userVars["{{name}}"] = String(to_name);
    userVars["{{email}}"] = to_email;

    const varMap = isSingle ? userVars : { ...SAMPLE, ...userVars };
    const html = render(tpl.html_body, varMap);
    const subject = (isSingle ? "" : "[ТЕСТ] ") + render(tpl.subject, varMap);

    console.log("send-test-email smtp start", { from: smtp.from_email, host: smtp.host, port: smtp.port, to: to_email });
    await sendWithTimeout(smtp, { to: to_email, subject, html });
    console.log("send-test-email smtp ok", { from: smtp.from_email, to: to_email });

    if (senderPoolEmail) {
      await admin.from("email_sender_pool").update({
        last_error: null,
        last_error_at: null,
        last_used_at: new Date().toISOString(),
      }).eq("email", senderPoolEmail);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("send-test-email error", msg);
    if (admin && senderPoolEmail) {
      try {
        await admin.from("email_sender_pool").update({
          last_error: msg,
          last_error_at: new Date().toISOString(),
        }).eq("email", senderPoolEmail);
      } catch (_) { /* ignore status update failures */ }
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
