// Edge Function: send-staff-invitation
// Создаёт запись в staff_invitations и отправляет email с magic-link.
// Поддерживает invitation_type: 'admin' | 'organization' | 'company'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function b64(s: string) { return btoa(unescape(encodeURIComponent(s))); }
function encSubject(s: string) { return `=?UTF-8?B?${b64(s)}?=`; }
function encFrom(from: string) {
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
    console.error("SMTP send error:", e);
    return false;
  }
}

function buildHtml(opts: {
  recipientName?: string;
  inviterName: string;
  invitationType: string;
  roleLabel: string;
  organizationName?: string;
  acceptUrl: string;
}): string {
  const { recipientName, inviterName, invitationType, roleLabel, organizationName, acceptUrl } = opts;
  const targetName = invitationType === 'admin'
    ? 'платформы Синтагма'
    : invitationType === 'organization'
      ? `организации «${organizationName || ''}»`
      : `компании «${organizationName || ''}»`;
  return `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
    <div style="padding:24px 32px;border-bottom:1px solid #eee;">
      <h1 style="margin:0;font-size:20px;color:#111;">Приглашение в команду</h1>
    </div>
    <div style="padding:24px 32px;color:#333;font-size:14px;line-height:1.6;">
      <p>Здравствуйте${recipientName ? `, ${recipientName}` : ''}!</p>
      <p><strong>${inviterName}</strong> приглашает вас стать сотрудником ${targetName} в роли «${roleLabel}».</p>
      <p>Чтобы принять приглашение, нажмите кнопку ниже. Ссылка действует 7 дней.</p>
      <p style="margin:32px 0;text-align:center;">
        <a href="${acceptUrl}" style="display:inline-block;padding:14px 28px;background:#0d9488;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">
          Принять приглашение
        </a>
      </p>
      <p style="font-size:12px;color:#888;">Если кнопка не работает, скопируйте ссылку:<br><code style="word-break:break-all;">${acceptUrl}</code></p>
    </div>
    <div style="padding:16px 32px;background:#fafafa;font-size:12px;color:#888;text-align:center;">
      Если вы не ожидали это письмо — просто проигнорируйте его.
    </div>
  </div>
</body></html>`;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Супер-админ",
  admin: "Администратор",
  sales_manager: "Менеджер по продажам",
  viewer: "Наблюдатель",
  owner: "Владелец",
  school_editor: "Редактор школы",
  course_editor: "Редактор курсов",
  teacher: "Преподаватель",
  hr: "HR-менеджер",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const inviter = userData.user;

    const body = await req.json();
    const {
      email,
      role,
      invitation_type,
      organization_id,
      company_id,
      sections_access,
      recipient_name,
    } = body;

    if (!email || !role || !invitation_type) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!['admin', 'organization', 'company'].includes(invitation_type)) {
      return new Response(JSON.stringify({ error: "Invalid invitation_type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Inviter name + organization name
    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", inviter.id)
      .maybeSingle();
    const inviterName = inviterProfile?.full_name || inviterProfile?.email || inviter.email || "Администратор";

    let organizationName = "";
    if (invitation_type === 'organization' && organization_id) {
      const { data: org } = await admin
        .from("organizations")
        .select("name")
        .eq("id", organization_id)
        .maybeSingle();
      organizationName = org?.name || "";
    } else if (invitation_type === 'company' && company_id) {
      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("id", company_id)
        .maybeSingle();
      organizationName = company?.name || "";
    }

    // Generate token
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await admin.from("staff_invitations").insert({
      email: email.trim().toLowerCase(),
      role,
      invitation_type,
      organization_id: invitation_type === 'organization' ? organization_id : null,
      company_id: invitation_type === 'company' ? company_id : null,
      sections_access: sections_access || null,
      token,
      expires_at: expiresAt,
      invited_by: inviter.id,
      recipient_name: recipient_name || null,
    } as any);

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build accept URL
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, '') || "https://sintagma.com.ru";
    const acceptUrl = `${origin}/accept-invitation?token=${token}`;

    const html = buildHtml({
      recipientName: recipient_name,
      inviterName,
      invitationType: invitation_type,
      roleLabel: ROLE_LABELS[role] || role,
      organizationName,
      acceptUrl,
    });
    const subject = `Приглашение в ${invitation_type === 'admin' ? 'команду платформы' : invitation_type === 'organization' ? `организацию «${organizationName}»` : `компанию «${organizationName}»`}`;

    const sent = await sendSmtp(email.trim().toLowerCase(), subject, html);

    return new Response(JSON.stringify({ success: true, sent, accept_url: acceptUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-staff-invitation error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
