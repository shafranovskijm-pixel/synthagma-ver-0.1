// Explicit SMTP send test: organization calls require active sales.write access;
// platform calls require platform admin. Recipient is the stored sender address.
// Caller-scoped authorization precedes service-role credential access.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, sendPlatformEmail, getPlatformSmtpConfig } from "../_shared/smtp-sender.ts";
import { canManageMailing, mailingAccountActive } from "../_shared/mailing-authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Sintagma-Function-Revision",
  "X-Sintagma-Function-Revision": "s004-mailing-beta-20261012",
};

interface ReqBody {
  organizationId?: string;
  scope?: "platform" | "org";
  // body.to intentionally not read — org tests always send to from_email.
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isServiceRole = bearer.length > 0 && bearer === SERVICE_KEY;

    // User client carries the caller's JWT and MUST be used for
    // auth.getUser(), has_role() and can_access_organization().
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    let isAdmin = false;
    if (!isServiceRole) {
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      if (!await mailingAccountActive(userClient)) return json({ error: "Forbidden" }, 403);
      const userId = userData.user.id;
      const { data: adminRow } = await userClient.rpc("has_role", {
        _role: "admin", _user_id: userId,
      });
      isAdmin = adminRow === true;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body: ReqBody = await req.json().catch(() => ({}));
    const scope = body.scope || (body.organizationId ? "org" : "platform");

    // ============ PLATFORM TEST (admin or service_role) ============
    if (scope === "platform") {
      if (!isServiceRole && !isAdmin) return json({ error: "Forbidden" }, 403);

      let cfg;
      try { cfg = getPlatformSmtpConfig(); }
      catch (e) { return json({ success: false, error: (e as Error).message }, 200); }

      const recipient = cfg.from_email;
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h1 style="color:#0EA5A4">Платформенный SMTP работает! ✅</h1>
          <p>Тестовое письмо (${new Date().toLocaleString("ru-RU")}).</p>
        </div></body></html>`;
      const res = await sendPlatformEmail({
        to: recipient,
        subject: "✅ Тест платформенного SMTP — Sintagma",
        html, skipRateLimit: true,
      });
      return json({ success: res.ok, error: res.error, sent_to: recipient }, 200);
    }

    // ============ ORG TEST (admin OR sales.write OR service_role) ============
    if (!body.organizationId) return json({ error: "organizationId required" }, 400);

    let orgAuthorized = false;
    if (isServiceRole || isAdmin) {
      orgAuthorized = true;
    } else {
      orgAuthorized = await canManageMailing(userClient, body.organizationId);
    }
    if (!orgAuthorized) return json({ error: "Forbidden" }, 403);

    const { data: metadata, error: metadataError } = await admin.from("org_smtp_settings")
      .select("updated_at").eq("organization_id", body.organizationId).maybeSingle();
    if (metadataError || !metadata) return json({ error: "SMTP не настроен" }, 404);

    // Only after auth: use service_role to read decrypted SMTP.
    const { data: smtpData, error: smtpError } = await admin.rpc("get_decrypted_org_smtp", {
      p_organization_id: body.organizationId,
    });
    if (smtpError) return json({ error: smtpError.message }, 500);
    const smtp = (smtpData || [])[0];
    if (!smtp) return json({ error: "SMTP не настроен" }, 404);

    // Recipient is ALWAYS the stored from_email — user cannot supply body.to.
    const recipient = smtp.from_email;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#0EA5A4">SMTP работает! ✅</h1>
        <p>Тестовое письмо от Sintagma (${new Date().toLocaleString("ru-RU")}).</p>
      </div></body></html>`;

    let testError: string | null = null;
    try {
      await sendSmtpEmail({
        host: smtp.host, port: smtp.port, username: smtp.username,
        password: smtp.password, encryption: smtp.encryption,
        from_email: smtp.from_email, from_name: smtp.from_name,
      }, { to: recipient, subject: "✅ Тест SMTP — Sintagma", html });
    } catch (e) { testError = (e as Error).message; }

    // Touch is_verified only when authorized (we are, at this point).
    const { data: verified, error: verifyError } = await admin.from("org_smtp_settings").update({
      is_verified: testError === null,
      last_test_at: new Date().toISOString(),
      last_test_error: testError,
    }).eq("organization_id", body.organizationId).eq("updated_at", metadata.updated_at)
      .select("organization_id").maybeSingle();
    if (verifyError || !verified) return json({ success: false, error: "Настройки изменились. Повторите проверку.", retry_required: true }, 200);

    return json({ success: testError === null, error: testError, sent_to: recipient }, 200);
  } catch (e) {
    console.error("test-org-smtp error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
