// Edge Function: send-staff-invitation
// Создаёт запись в staff_invitations и отправляет email с magic-link.
// Поддерживает invitation_type: 'admin' | 'organization' | 'company'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail, sendSmtpEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendSmtp(admin: any, to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  // Пул отправителей (LRU) с fallback на платформенный SMTP
  let lastError = "";
  try {
    const { data: pickData, error: pickError } = await admin.rpc("pick_next_email_sender");
    const sender = Array.isArray(pickData) ? pickData[0] : null;
    if (!pickError && sender) {
      try {
        await sendSmtpEmail(
          {
            host: sender.host,
            port: sender.port,
            username: sender.email,
            password: sender.app_password,
            encryption: sender.encryption,
            from_email: sender.email,
            from_name: sender.from_name || "Синтагма",
          },
          { to, subject, html },
        );
        await admin.rpc("mark_email_sender_result", { p_sender_id: sender.id, p_ok: true, p_error: null }).catch(() => {});
        return { ok: true };
      } catch (poolErr) {
        lastError = (poolErr as Error).message;
        console.warn(`Pool sender ${sender.email} failed: ${lastError}. Fallback to platform SMTP.`);
        await admin.rpc("mark_email_sender_result", { p_sender_id: sender.id, p_ok: false, p_error: lastError }).catch(() => {});
      }
    } else if (pickError) {
      console.warn("pick_next_email_sender error:", pickError.message);
    }
  } catch (e) {
    console.warn("Sender pool exception:", (e as Error).message);
  }
  const r = await sendPlatformEmail({ to, subject, html });
  if (!r.ok) {
    const err = `пул: ${lastError || "недоступен"}; платформа: ${r.error || "ошибка"}`;
    console.error("SMTP send error:", err);
    return { ok: false, error: err };
  }
  return { ok: true };
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
    if (!['admin', 'organization', 'company', 'sales'].includes(invitation_type)) {
      return new Response(JSON.stringify({ error: "Invalid invitation_type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const skipEmail = !!body.skip_email;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ===== Phase 5D.2 — серверная авторизация ДО любых service-role записей =====
    const forbidden = (message: string) => new Response(JSON.stringify({ error: message, code: "FORBIDDEN" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    if (role === "owner") {
      return forbidden("Роль «Владелец» нельзя выдать через приглашение");
    }
    if (invitation_type === "organization" && !organization_id) {
      return new Response(JSON.stringify({ error: "Не указана организация" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (invitation_type === "company" && !company_id) {
      return new Response(JSON.stringify({ error: "Не указана компания" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (invitation_type !== "organization" && organization_id) {
      return new Response(JSON.stringify({ error: "organization_id недопустим для этого типа приглашения" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (invitation_type !== "company" && company_id) {
      return new Response(JSON.stringify({ error: "company_id недопустим для этого типа приглашения" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inviterRoleRow, error: inviterRoleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", inviter.id)
      .maybeSingle();
    if (inviterRoleErr) {
      console.error("role lookup error:", inviterRoleErr.message);
      return new Response(JSON.stringify({ error: "Внутренняя ошибка сервера" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const isGlobalAdmin = inviterRoleRow?.role === "admin";

    if (!isGlobalAdmin) {
      if (invitation_type === "admin" || invitation_type === "sales") {
        return forbidden("Недостаточно прав для создания приглашения");
      }

      if (invitation_type === "organization") {
        const { data: ownerCheck, error: ownerErr } = await admin
          .rpc("is_org_owner", { _user_id: inviter.id, _organization_id: organization_id });
        if (ownerErr) {
          console.error("is_org_owner error:", ownerErr.message);
          return new Response(JSON.stringify({ error: "Внутренняя ошибка сервера" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        let allowed = !!ownerCheck;
        if (!allowed) {
          const { data: staffRow } = await admin
            .from("org_staff")
            .select("role, expires_at")
            .eq("organization_id", organization_id)
            .eq("user_id", inviter.id)
            .maybeSingle();
          const active = staffRow && (!staffRow.expires_at || new Date(staffRow.expires_at) > new Date());
          if (active) {
            const { data: permOk } = await admin.rpc("has_org_staff_permission", {
              _user_id: inviter.id,
              _organization_id: organization_id,
              _permission: "staff.write",
            });
            allowed = !!permOk;
          }
        }
        if (!allowed) return forbidden("Недостаточно прав для приглашения сотрудников этой организации");
      }

      if (invitation_type === "company") {
        const { data: companyRow, error: companyErr } = await admin
          .from("companies")
          .select("user_id")
          .eq("id", company_id)
          .maybeSingle();
        if (companyErr) {
          console.error("company lookup error:", companyErr.message);
          return new Response(JSON.stringify({ error: "Внутренняя ошибка сервера" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!companyRow || companyRow.user_id !== inviter.id) {
          return forbidden("Недостаточно прав для приглашения в эту компанию");
        }
      }
    }
    // ===== /авторизация =====


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
      invited_by_name: inviterName,
      full_name: recipient_name || null,
    } as any);

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Не удалось создать приглашение" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build accept URL.
    // Production по умолчанию — синтагма.рф (punycode), т.к. sintagma.com.ru не работает в РФ без VPN.
    // PUBLIC_APP_URL (если задан) имеет приоритет.
    const publicAppUrl = (Deno.env.get("PUBLIC_APP_URL") || "").replace(/\/+$/, "");
    const defaultOrigin = /^https:\/\/[^/]+$/.test(publicAppUrl) ? publicAppUrl : "https://xn--80aaiswd0ak.xn--p1ai";
    const rawOrigin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, '') || "";
    const allowedOriginPatterns = [
      /^https:\/\/xn--80aaiswd0ak\.xn--p1ai$/,
      /^https:\/\/синтагма\.рф$/,
      // тестовые/служебные окружения
      /^http:\/\/localhost(:\d+)?$/,
      /^https:\/\/sintagma\.online$/,
      /^https:\/\/[a-z0-9-]+\.twc1\.net$/,
      /^https:\/\/[a-z0-9-]+\.lovable\.(app|dev)$/,
      /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app$/,
      /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
    ];
    const origin = allowedOriginPatterns.some((r) => r.test(rawOrigin))
      ? rawOrigin
      : defaultOrigin;
    const acceptUrl = `${origin}/accept-invitation?token=${token}`;


    const html = buildHtml({
      recipientName: recipient_name,
      inviterName,
      invitationType: invitation_type,
      roleLabel: ROLE_LABELS[role] || role,
      organizationName,
      acceptUrl,
    });
    const subject = `Приглашение в ${invitation_type === 'admin' ? 'команду платформы' : invitation_type === 'organization' ? `организацию «${organizationName}»` : invitation_type === 'sales' ? 'команду продаж Синтагмы' : `компанию «${organizationName}»`}`;

    const sendResult = skipEmail
      ? { ok: false as const, error: undefined as string | undefined }
      : await sendSmtp(admin, email.trim().toLowerCase(), subject, html);

    return new Response(
      JSON.stringify({
        success: true,
        sent: sendResult.ok,
        email_error: skipEmail ? null : (sendResult.ok ? null : (sendResult.error || "Не удалось отправить письмо")),
        accept_url: acceptUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("send-staff-invitation error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
