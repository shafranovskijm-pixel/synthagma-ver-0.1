// Этап 3 — защищённый тест подключения отправителя рассылок.
// Проверяет ТОЛЬКО авторизацию на SMTP/IMAP. Писем не отправляет,
// писем не читает. Пароль не возвращается клиенту и не логируется.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { connectImap, closeImap } from "../_shared/imap-mini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const enc = new TextEncoder();
const dec = new TextDecoder();

async function smtpAuthOnly(cfg: {
  host: string;
  port: number;
  security: string;
  username: string;
  password: string;
}): Promise<void> {
  const useTls = cfg.security !== "starttls" && cfg.security !== "none";
  let conn: Deno.Conn = useTls
    ? await Deno.connectTls({ hostname: cfg.host, port: cfg.port })
    : await Deno.connect({ hostname: cfg.host, port: cfg.port });

  const buf = new Uint8Array(4096);
  const read = async (): Promise<string> => {
    const n = await conn.read(buf);
    if (n === null) throw new Error("SMTP connection closed");
    return dec.decode(buf.subarray(0, n));
  };
  const write = async (line: string) => {
    await conn.write(enc.encode(line + "\r\n"));
  };
  const expect = async (codes: string[], step: string) => {
    const resp = await read();
    if (!codes.some((c) => resp.startsWith(c))) {
      throw new Error(`SMTP ${step} failed: ${resp.slice(0, 120)}`);
    }
    return resp;
  };

  try {
    await expect(["220"], "greeting");
    await write(`EHLO ${cfg.host}`);
    await expect(["250"], "EHLO");

    if (cfg.security === "starttls") {
      await write("STARTTLS");
      await expect(["220"], "STARTTLS");
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: cfg.host });
      await write(`EHLO ${cfg.host}`);
      await expect(["250"], "EHLO");
    }

    await write("AUTH LOGIN");
    await expect(["334"], "AUTH");
    await write(btoa(cfg.username));
    await expect(["334"], "AUTH username");
    await write(btoa(cfg.password));
    await expect(["235"], "authentication");
    await write("QUIT");
  } finally {
    try {
      conn.close();
    } catch {
      /* ignore */
    }
  }
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
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const senderId = typeof body?.sender_id === "string" ? body.sender_id : "";
    const mode = body?.mode === "imap" ? "imap" : "smtp";
    if (!senderId) return json({ error: "sender_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: rows, error: secretErr } = await admin.rpc("get_mailing_sender_secret", {
      p_sender_id: senderId,
    });
    const cfg = Array.isArray(rows) ? rows[0] : rows;
    if (secretErr || !cfg) return json({ success: false, error_category: "config" }, 200);

    // Авторизация: администратор платформы ИЛИ участник организации аккаунта.
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

    if (!cfg.secret) {
      await admin
        .from("mailing_senders")
        .update(
          mode === "smtp"
            ? { smtp_status: "error", smtp_error_category: "config", last_tested_at: new Date().toISOString() }
            : { imap_status: "error", imap_error_category: "config", imap_last_tested_at: new Date().toISOString() },
        )
        .eq("id", senderId);
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
    await admin.from("mailing_senders").update(patch).eq("id", senderId);

    // Ответ содержит только success / error_category / latency_ms.
    return json({ success, error_category: success ? null : category, latency_ms: latency }, 200);
  } catch {
    return json({ success: false, error_category: "unknown" }, 200);
  }
});
