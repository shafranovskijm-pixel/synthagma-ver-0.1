import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, sendPlatformEmail, getPlatformSmtpConfig } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  organizationId?: string;
  scope?: "platform" | "org";
  to?: string; // для platform-теста (если не задан — берём SMTP_FROM)
}

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
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ReqBody = await req.json().catch(() => ({}));
    const scope = body.scope || (body.organizationId ? "org" : "platform");

    // ========== PLATFORM SMTP TEST ==========
    if (scope === "platform") {
      let cfg;
      try {
        cfg = getPlatformSmtpConfig();
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const recipient = body.to || cfg.from_email;
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#0EA5A4">Платформенный SMTP работает! ✅</h1>
          <p>Это тестовое письмо для проверки настроек платформенного SMTP.</p>
          <hr style="border:1px solid #e2e8f0;margin:20px 0">
          <p style="color:#64748b;font-size:12px">
            Сервер: ${cfg.host}:${cfg.port}<br>
            От кого: ${cfg.from_email}<br>
            Время: ${new Date().toLocaleString("ru-RU")}
          </p>
        </div>
      </body></html>`;

      const res = await sendPlatformEmail({
        to: recipient,
        subject: "✅ Тест платформенного SMTP — Sintagma",
        html,
        skipRateLimit: true,
      });

      return new Response(
        JSON.stringify({ success: res.ok, error: res.error, sent_to: recipient }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== ORG SMTP TEST ==========
    if (!body.organizationId) {
      return new Response(JSON.stringify({ error: "organizationId required for scope=org" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const userClientRpc = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: smtpData, error: smtpError } = await userClientRpc.rpc("get_decrypted_org_smtp", {
      p_organization_id: body.organizationId,
    });
    if (smtpError) {
      return new Response(JSON.stringify({ error: smtpError.message }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const smtp = (smtpData || [])[0];
    if (!smtp) {
      return new Response(JSON.stringify({ error: "SMTP не настроен" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#0EA5A4">SMTP работает! ✅</h1>
        <p>Это тестовое письмо из вашей рассылочной системы Sintagma.</p>
        <p>Если вы видите это письмо в своём ящике — значит SMTP-настройки введены корректно и вы можете запускать кампании.</p>
        <hr style="border:1px solid #e2e8f0;margin:20px 0">
        <p style="color:#64748b;font-size:12px">
          Сервер: ${smtp.host}:${smtp.port}<br>
          От кого: ${smtp.from_email}<br>
          Время: ${new Date().toLocaleString("ru-RU")}
        </p>
      </div>
    </body></html>`;

    let testError: string | null = null;
    try {
      await sendSmtpEmail({
        host: smtp.host, port: smtp.port, username: smtp.username,
        password: smtp.password, encryption: smtp.encryption,
        from_email: smtp.from_email, from_name: smtp.from_name,
      }, {
        to: smtp.from_email,
        subject: "✅ Тест SMTP — Sintagma",
        html,
      });
    } catch (e) {
      testError = (e as Error).message;
    }

    await admin.from("org_smtp_settings").update({
      is_verified: testError === null,
      last_test_at: new Date().toISOString(),
      last_test_error: testError,
    }).eq("organization_id", body.organizationId);

    return new Response(
      JSON.stringify({ success: testError === null, error: testError, sent_to: smtp.from_email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("test-org-smtp error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
