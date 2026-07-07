// Sends a platform commercial proposal: clones a template proposal for the lead,
// renders the platform email template "Отправка КП", and sends via platform SMTP.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, type SmtpConfig } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROPOSAL_EMAIL_TEMPLATE_ID = "d98ee5a8-53b8-45f9-9465-3c84a57e3d96";

function getPlatformSmtp(): SmtpConfig {
  const host = Deno.env.get("SMTP_HOST");
  const port = Deno.env.get("SMTP_PORT");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  const fromEnv = Deno.env.get("SMTP_FROM") || "noreply@sintagma.com.ru";
  if (!host || !port || !user || !pass) throw new Error("Платформенный SMTP не настроен");
  const m = fromEnv.match(/^(.+?)\s*<(.+)>$/);
  return {
    host, port: parseInt(port, 10), username: user, password: pass,
    encryption: parseInt(port, 10) === 465 ? "ssl" : "starttls",
    from_email: m ? m[2].trim() : fromEnv,
    from_name: m ? m[1].trim() : "СИНТАГМА",
  };
}

/**
 * Пробуем взять активный ящик из email_sender_pool (LRU). Если пул пуст
 * или недоступен — вернём null, и вызывающий код использует глобальные SMTP_* секреты.
 */
async function pickSenderFromPool(admin: any): Promise<{ senderId: string; smtp: SmtpConfig } | null> {
  try {
    const { data, error } = await admin.rpc("pick_next_email_sender");
    if (error || !data || !data.length) return null;
    const row = data[0];
    if (!row?.host || !row?.email || !row?.app_password) return null;
    return {
      senderId: row.id as string,
      smtp: {
        host: row.host,
        port: Number(row.port || 465),
        username: row.email,
        password: row.app_password,
        encryption: (row.encryption as string) || (Number(row.port) === 465 ? "ssl" : "starttls"),
        from_email: row.email,
        from_name: row.from_name || "СИНТАГМА",
      },
    };
  } catch (_e) {
    return null;
  }
}

function render(html: string, vars: Record<string, string>): string {
  let h = html || "";
  for (const [k, v] of Object.entries(vars)) {
    h = h.split(`{{${k}}}`).join(v);
  }
  return h;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      template_proposal_id,
      recipient_email,
      company_name,
      contact_person,
      lead_id,
      sender_name,
    } = body || {};

    if (!template_proposal_id || !recipient_email || !company_name) {
      return new Response(JSON.stringify({ error: "template_proposal_id, recipient_email и company_name обязательны" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth: must be a logged-in user (sales_manager / admin / etc.)
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Load template proposal + services
    const { data: tpl, error: tplErr } = await admin
      .from("commercial_proposals").select("*").eq("id", template_proposal_id).eq("is_template", true).single();
    if (tplErr || !tpl) throw new Error("Шаблон КП не найден");

    const { data: tplServices } = await admin
      .from("commercial_proposal_services").select("*").eq("proposal_id", template_proposal_id).order("sort_order");

    // 2. Clone proposal for this lead
    const cloned = {
      created_by: user.id,
      company_name,
      company_email: recipient_email,
      contact_person: contact_person || null,
      scope: "platform",
      status: "draft",
      is_template: false,
      total_amount: tpl.total_amount,
      valid_until: tpl.valid_until,
      sender_name: tpl.sender_name,
      sender_email: tpl.sender_email,
      sender_website: tpl.sender_website,
      intro_html: tpl.intro_html,
      outro_html: tpl.outro_html,
      custom_note: tpl.custom_note,
      tariff_plan: tpl.tariff_plan,
      template_id: PROPOSAL_EMAIL_TEMPLATE_ID,
    };
    const { data: newProposal, error: cloneErr } = await admin
      .from("commercial_proposals").insert(cloned).select("id").single();
    if (cloneErr) throw new Error("Не удалось клонировать КП: " + cloneErr.message);

    if (tplServices?.length) {
      const rows = tplServices.map((s, idx) => ({
        proposal_id: newProposal.id,
        custom_name: s.custom_name,
        custom_description: s.custom_description,
        price: s.price,
        quantity: s.quantity,
        sort_order: idx,
      }));
      await admin.from("commercial_proposal_services").insert(rows);
    }

    // 3. Render email
    const baseUrl = (Deno.env.get("PUBLIC_BASE_URL") || "https://sintagma.com.ru").replace(/\/$/, "");
    const proposalUrl = `${baseUrl}/proposal/${newProposal.id}`;

    const { data: emailTpl } = await admin
      .from("email_templates").select("subject, html_body").eq("id", PROPOSAL_EMAIL_TEMPLATE_ID).maybeSingle();

    const vars = {
      company: company_name,
      contact: contact_person || "",
      proposal_url: proposalUrl,
      sender_name: sender_name || "Менеджер СИНТАГМА",
      proposal_title: tpl.company_name, // template's name acts as title
    };

    const fallbackHtml = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px">
        <h2 style="color:#0EA5A4">Коммерческое предложение от СИНТАГМА</h2>
        <p>Здравствуйте${contact_person ? ", " + contact_person : ""}!</p>
        <p>Направляем коммерческое предложение «${tpl.company_name}» для компании <b>${company_name}</b>.</p>
        <p><a href="${proposalUrl}" style="display:inline-block;background:#0EA5A4;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none">Открыть предложение</a></p>
        <p style="color:#64748B;font-size:13px">С уважением,<br/>${vars.sender_name}<br/>СИНТАГМА · support@sintagma.com.ru</p>
      </div>`;

    const html = emailTpl?.html_body ? render(emailTpl.html_body, vars) : fallbackHtml;
    const subject = emailTpl?.subject
      ? render(emailTpl.subject, vars)
      : `Коммерческое предложение от СИНТАГМА — ${company_name}`;

    // 4. Send: сначала пробуем пул отправителей (LRU), затем fallback на глобальные SMTP_* секреты.
    const pooled = await pickSenderFromPool(admin);
    const attempts: Array<{ smtp: SmtpConfig; senderId: string | null; label: string }> = [];
    if (pooled) attempts.push({ smtp: pooled.smtp, senderId: pooled.senderId, label: `pool:${pooled.smtp.username}` });
    try {
      const fallback = getPlatformSmtp();
      attempts.push({ smtp: fallback, senderId: null, label: `env:${fallback.username}` });
    } catch (_e) {
      // если пула нет и env не настроен — упадём ниже
    }
    if (!attempts.length) {
      await admin.from("commercial_proposals").update({ status: "draft" }).eq("id", newProposal.id);
      throw new Error("Не настроен ни один SMTP-отправитель (нет активных ящиков в пуле и нет секретов SMTP_*)");
    }

    let sendError: string | null = null;
    let sent = false;
    for (const attempt of attempts) {
      const deadline = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("SMTP timeout (25s)")), 25_000),
      );
      try {
        await Promise.race([
          sendSmtpEmail(attempt.smtp, { to: recipient_email, subject, html }),
          deadline,
        ]);
        if (attempt.senderId) {
          await admin.rpc("mark_email_sender_result", { _sender_id: attempt.senderId, _error: null }).catch(() => {});
        }
        sent = true;
        console.log("send-platform-proposal ok via", attempt.label);
        break;
      } catch (err) {
        const msg = (err as Error).message;
        sendError = `${attempt.label}: ${msg}`;
        console.error("send-platform-proposal failed", attempt.label, msg);
        if (attempt.senderId) {
          await admin.rpc("mark_email_sender_result", { _sender_id: attempt.senderId, _error: msg }).catch(() => {});
        }
      }
    }
    if (!sent) {
      await admin.from("commercial_proposals").update({ status: "draft" }).eq("id", newProposal.id);
      throw new Error("SMTP: " + (sendError || "неизвестная ошибка"));
    }

    // mark as sent only on real success
    await admin.from("commercial_proposals")
      .update({ status: "sent", last_sent_at: new Date().toISOString() })
      .eq("id", newProposal.id);


    // 5. Log activity if lead provided
    if (lead_id) {
      // get or create manager
      let managerId: string | null = null;
      const { data: m } = await admin.from("sales_managers").select("id").eq("user_id", user.id).maybeSingle();
      if (m?.id) {
        managerId = m.id;
      } else {
        const { data: nm } = await admin.from("sales_managers")
          .insert({ user_id: user.id, full_name: vars.sender_name, is_active: true })
          .select("id").single();
        managerId = nm?.id || null;
      }
      if (managerId) {
        await admin.from("sales_lead_activities").insert({
          lead_id,
          manager_id: managerId,
          activity_type: "proposal_sent",
          description: `КП «${tpl.company_name}» отправлено на ${recipient_email}\n${proposalUrl}`,
        });
        await admin.from("sales_leads").update({
          status: "proposal",
          last_contact_at: new Date().toISOString(),
        }).eq("id", lead_id);
      }
    }

    return new Response(JSON.stringify({
      success: true, proposal_id: newProposal.id, proposal_url: proposalUrl,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("send-platform-proposal error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
