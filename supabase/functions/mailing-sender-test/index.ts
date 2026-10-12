// Этап 3 — защищённый тест подключения отправителя рассылок.
// Проверяет ТОЛЬКО авторизацию на SMTP/IMAP. Писем не отправляет,
// писем не читает. Пароль не возвращается клиенту и не логируется.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { connectImap, closeImap } from "../_shared/imap-mini.ts";
import { smtpAuthOnly, type AuthConnection } from "../_shared/smtp-auth-only.ts";
import { canManageMailing } from "../_shared/mailing-authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Sintagma-Function-Revision",
  "X-Sintagma-Function-Revision": "s004-mailing-beta-20261012",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Category = "ok" | "auth" | "connection" | "tls" | "timeout" | "config" | "unknown";

function categorize(message: string): Category {
  const m = message.toLowerCase();
  if (/timeout|timed out/.test(m)) return "timeout";
  if (/535|534|authenticat|login failed|invalid credentials|imap login/.test(m)) return "auth";
  if (/tls|certificate|ssl/.test(m)) return "tls";
  if (/connect|refused|dns|unreachable|host|closed/.test(m)) return "connection";
  return "unknown";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
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
    if (body?.mode !== "imap" && body?.mode !== "smtp") return json({ error: "Invalid mode" }, 400);
    const mode = body.mode;
    if (!senderId) return json({ error: "sender_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    // Resolve only non-secret tenant metadata before the caller permission gate.
    const { data: sender, error: senderError } = await admin.from("mailing_senders")
      .select("organization_id, updated_at").eq("id", senderId).maybeSingle();
    if (senderError || !sender || !await canManageMailing(userClient, sender.organization_id)) {
      return json({ error: "Forbidden" }, 403);
    }
    const { data: rows, error: secretErr } = await admin.rpc("get_mailing_sender_secret", {
      p_sender_id: senderId,
    });
    const cfg = Array.isArray(rows) ? rows[0] : rows;
    if (secretErr || !cfg) return json({ success: false, error_category: "config" }, 200);

    if (cfg.organization_id !== sender.organization_id) return json({ error: "Forbidden" }, 403);

    if (!cfg.secret) {
      await admin
        .from("mailing_senders")
        .update(
          mode === "smtp"
            ? { smtp_status: "error", smtp_error_category: "config", last_tested_at: new Date().toISOString() }
            : { imap_status: "error", imap_error_category: "config", imap_last_tested_at: new Date().toISOString() },
        )
        .eq("id", senderId).eq("organization_id", sender.organization_id).eq("updated_at", sender.updated_at);
      return json({ success: false, error_category: "config" }, 200);
    }

    const started = Date.now();
    let category: Category = "ok";
    try {
      if (mode === "smtp") {
        await smtpAuthOnly({
          host: cfg.smtp_host,
          port: cfg.smtp_port,
          security: cfg.smtp_security || "ssl",
          username: cfg.smtp_username,
          password: cfg.secret,
        }, {
          connect: (tls, host, port) => tls ? Deno.connectTls({ hostname: host, port }) : Deno.connect({ hostname: host, port }),
          startTls: (connection: AuthConnection, host) => Deno.startTls(connection as Deno.TcpConn, { hostname: host }),
        });
      } else {
        if (!cfg.imap_host) throw new Error("config: imap host missing");
        // IMAP: только LOGIN + LOGOUT, письма не читаются.
        const c = await connectImap({
          host: cfg.imap_host,
          port: cfg.imap_port || 993,
          user: cfg.imap_username || cfg.smtp_username,
          password: cfg.secret,
        });
        await closeImap(c);
      }
    } catch (e) {
      const msg = (e as Error).message || "";
      category = msg.startsWith("config:") ? "config" : categorize(msg);
    }
    const latency = Date.now() - started;
    const success = category === "ok";

    const patch =
      mode === "smtp"
        ? {
            smtp_status: success ? "ok" : "error",
            smtp_error_category: success ? null : category,
            smtp_latency_ms: latency,
            last_tested_at: new Date().toISOString(),
          }
        : {
            imap_status: success ? "ok" : "error",
            imap_error_category: success ? null : category,
            imap_latency_ms: latency,
            imap_last_tested_at: new Date().toISOString(),
          };
    const { data: saved, error: saveError } = await admin.from("mailing_senders").update(patch)
      .eq("id", senderId).eq("organization_id", sender.organization_id).eq("updated_at", sender.updated_at)
      .select("id").maybeSingle();
    // A concurrent credential edit must never acquire an old successful test.
    if (saveError || !saved) return json({ success: false, error_category: "config", retry_required: true }, 200);

    // Ответ содержит только success / error_category / latency_ms.
    return json({ success, error_category: success ? null : category, latency_ms: latency }, 200);
  } catch {
    return json({ success: false, error_category: "unknown" }, 200);
  }
});
