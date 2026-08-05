// Этап 3 — seed-отправка письма кампании на 1–5 вручную введённых адресов.
// Адреса приходят только из формы («Тестовая отправка») и НИКОГДА не берутся
// из базы получателей кампании. Пароль отправителя читается на сервере и
// не возвращается/не логируется.
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
    const senderId = typeof body?.sender_id === "string" ? body.sender_id : "";
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
    const html = typeof body?.html === "string" ? body.html : "";
    const rawSeeds: unknown = body?.seed_emails;
    if (!senderId || !subject || !html) return json({ error: "sender_id, subject, html required" }, 400);

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
    const { data: rows, error: secretErr } = await admin.rpc("get_mailing_sender_secret", {
      p_sender_id: senderId,
    });
    const cfg = Array.isArray(rows) ? rows[0] : rows;
    if (secretErr || !cfg) return json({ success: false, error_category: "config" }, 200);

    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: u.user.id,
      _role: "admin",
    });
    let allowed = !!isAdmin;
    if (!allowed) {
      const { data: canAccess } = await userClient.rpc("can_access_organization", {
        _organization_id: cfg.organization_id,
        _permission: "email.manage",
      });
      allowed = !!canAccess;
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    // Seed-отправка разрешена только после успешного SMTP-теста аккаунта.
    const { data: statusRow } = await admin
      .from("mailing_senders")
      .select("smtp_status")
      .eq("id", senderId)
      .maybeSingle();
    if (statusRow?.smtp_status !== "ok") {
      return json({ success: false, error_category: "smtp_not_tested" }, 200);
    }
    if (!cfg.secret) return json({ success: false, error_category: "config" }, 200);

    let sent = 0;
    let failed = 0;
    for (const to of seeds) {
      try {
        await sendSmtpEmail(
          {
            host: cfg.smtp_host,
            port: cfg.smtp_port,
            username: cfg.smtp_username,
            password: cfg.secret,
            encryption: (cfg.smtp_security || "ssl") === "starttls" ? "starttls" : "ssl",
            from_email: cfg.from_email,
            from_name: cfg.from_name || "СИНТАГМА",
          } as never,
          { to, subject: `[SEED] ${subject}`, html },
        );
        sent += 1;
      } catch {
        failed += 1;
      }
    }

    return json({ success: failed === 0, sent, failed }, 200);
  } catch {
    return json({ success: false, error_category: "unknown" }, 200);
  }
});
