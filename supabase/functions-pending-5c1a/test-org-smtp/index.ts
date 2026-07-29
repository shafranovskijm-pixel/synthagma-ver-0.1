// =====================================================================
// PENDING — Phase 5C.1.a. Do not deploy until the accompanying RLS
// migration is planned. Located OUTSIDE supabase/functions/ so Lovable
// does not auto-deploy it.
//
// Delta vs current supabase/functions/test-org-smtp/index.ts:
//   • Platform-scope test now requires admin (previously any authenticated user).
//   • Org-scope test requires admin OR can_access_organization(org, 'sales.write').
//   • Auth is checked BEFORE reading SMTP or updating is_verified.
//   • body.to is IGNORED for org tests — the test always goes to the
//     stored from_email, so a caller cannot exfiltrate via arbitrary
//     recipient.
//   • is_verified / last_test_at / last_test_error are only touched
//     when the caller is authorized; a 401/403 leaves the row untouched.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, sendPlatformEmail, getPlatformSmtpConfig } from "../../functions/_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  organizationId?: string;
  scope?: "platform" | "org";
  // body.to intentionally not read — org tests always send to from_email.
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
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body: ReqBody = await req.json().catch(() => ({}));
    const scope = body.scope || (body.organizationId ? "org" : "platform");

    // --- Admin lookup (both branches need it) ---
    const { data: adminRow } = await admin.rpc("has_role", {
      _role: "admin", _user_id: userId,
    });
    const isAdmin = adminRow === true;

    // ============ PLATFORM TEST (admin only) ============
    if (scope === "platform") {
      if (!isAdmin) return json({ error: "Forbidden" }, 403);

      let cfg;
      try { cfg = getPlatformSmtpConfig(); }
      catch (e) { return json({ success: false, error: (e as Error).message }, 200); }

      // Platform test always goes to the configured from_email — no override.
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

    // ============ ORG TEST (admin OR sales.write) ============
    if (!body.organizationId) return json({ error: "organizationId required" }, 400);

    const { data: writeRow } = await admin.rpc("can_access_organization", {
      _organization_id: body.organizationId,
      _permission: "sales.write",
    });
    const hasSalesWrite = writeRow === true;
    if (!isAdmin && !hasSalesWrite) return json({ error: "Forbidden" }, 403);

    // Read decrypted SMTP as service_role (Data API grants revoked from authenticated).
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

    // Only touch is_verified when we ARE authorized (we are, at this point).
    await admin.from("org_smtp_settings").update({
      is_verified: testError === null,
      last_test_at: new Date().toISOString(),
      last_test_error: testError,
    }).eq("organization_id", body.organizationId);

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
