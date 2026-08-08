import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, type SmtpConfig, type Attachment } from "../_shared/smtp-sender.ts";
import { buildIcs } from "../_shared/ics.ts";
import { processCampaignHtml } from "../_shared/email-html-utils.ts";
import { buildListUnsubscribeHeaders } from "../_shared/mailing-variables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody { campaignId: string; recipientId: string; }

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ============ Phase 5C.1.c: strict service-role gate ============
  // send-campaign-email must ONLY be invoked by run-email-campaign (which uses
  // the service-role key). Direct calls from browser/authenticated sessions
  // must be rejected before any JSON parsing, DB reads, or state mutation —
  // otherwise an authenticated user could dispatch emails and mutate recipient
  // status by hitting this URL directly.
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!bearer || bearer !== SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let recipientId: string | null = null;
  let campaignId: string | null = null;

  try {
    const body: ReqBody = await req.json();
    recipientId = body.recipientId;
    campaignId = body.campaignId;
    if (!recipientId || !campaignId) {
      return new Response(JSON.stringify({ error: "campaignId & recipientId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign, error: cErr } = await admin
      .from("email_campaigns").select("*").eq("id", campaignId).single();
    if (cErr || !campaign) throw new Error("Кампания не найдена");

    // Recipient must belong to the campaign — protects against id-guessing.
    const { data: recipient, error: rErr } = await admin
      .from("email_campaign_recipients").select("*")
      .eq("id", recipientId)
      .eq("campaign_id", campaignId)
      .single();
    if (rErr || !recipient) throw new Error("Получатель не найден");

    // ============ Suppression check ============
    const scopeKey = campaign.scope === "platform" ? "platform" : (campaign.organization_id || "platform");
    const { data: isSupp } = await admin.rpc("is_email_suppressed", {
      p_email: recipient.email,
      p_scope: scopeKey,
    });
    if (isSupp === true) {
      await admin.from("email_campaign_recipients").update({
        status: "failed",
        error: "Адрес в списке отписавшихся",
      }).eq("id", recipientId);
      const { data: c2 } = await admin.from("email_campaigns")
        .select("failed_count").eq("id", campaignId).single();
      await admin.from("email_campaigns").update({
        failed_count: (c2?.failed_count || 0) + 1,
      }).eq("id", campaignId);
      return new Response(JSON.stringify({ success: false, suppressed: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ Broadcast companies db check (не отправляем повторно) ============
    {
      const { data: alreadySent } = await admin
        .from("broadcast_companies_db")
        .select("email")
        .eq("email", (recipient.email as string).toLowerCase())
        .maybeSingle();
      if (alreadySent) {
        await admin.from("email_campaign_recipients").update({
          status: "failed",
          error: "Уже был в базе компаний рассылок",
        }).eq("id", recipientId);
        const { data: c2 } = await admin.from("email_campaigns")
          .select("failed_count").eq("id", campaignId).single();
        await admin.from("email_campaigns").update({
          failed_count: (c2?.failed_count || 0) + 1,
        }).eq("id", campaignId);
        return new Response(JSON.stringify({ success: false, alreadyInBroadcastDb: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Получаем SMTP-конфигурацию
    let smtp: SmtpConfig;
    if (campaign.scope === "platform") {
      const host = Deno.env.get("SMTP_HOST");
      const port = Deno.env.get("SMTP_PORT");
      const user = Deno.env.get("SMTP_USER");
      const pass = Deno.env.get("SMTP_PASS");
      const fromEnv = Deno.env.get("SMTP_FROM") || "noreply@sintagma.com.ru";
      if (!host || !port || !user || !pass) throw new Error("Платформенный SMTP не настроен");
      // Парсим SMTP_FROM, который может быть "Имя <email>"
      const m = fromEnv.match(/^(.+?)\s*<(.+)>$/);
      smtp = {
        host, port: parseInt(port, 10), username: user, password: pass,
        encryption: parseInt(port, 10) === 465 ? "ssl" : "starttls",
        from_email: m ? m[2].trim() : fromEnv,
        from_name: m ? m[1].trim() : (campaign.from_name || "Sintagma"),
      };
    } else if ((campaign as any).sender_id) {
      // org-scope, новый путь: подключённый аккаунт из mailing_senders.
      // organization_id / is_active / smtp_status проверяются на сервере,
      // from_email берётся ТОЛЬКО из аккаунта, секрет — только через RPC.
      const { data: sender, error: sndErr } = await admin
        .from("mailing_senders")
        .select("id, organization_id, is_active, smtp_status, from_name")
        .eq("id", (campaign as any).sender_id)
        .maybeSingle();
      if (sndErr) throw new Error("Ошибка получения отправителя");
      if (!sender) throw new Error("Отправитель не найден");
      if (!campaign.organization_id || sender.organization_id !== campaign.organization_id) {
        throw new Error("Отправитель принадлежит другой организации");
      }
      if (sender.is_active !== true) throw new Error("Отправитель отключён");
      if (sender.smtp_status !== "ok") throw new Error("Отправитель не прошёл SMTP-проверку");

      const { data: secretRows, error: secErr } = await admin.rpc("get_mailing_sender_secret", {
        p_sender_id: sender.id,
      });
      const cfg = Array.isArray(secretRows) ? secretRows[0] : secretRows;
      if (secErr || !cfg?.secret) throw new Error("Не удалось получить конфигурацию отправителя");
      smtp = {
        host: cfg.smtp_host,
        port: cfg.smtp_port,
        username: cfg.smtp_username,
        password: cfg.secret,
        encryption: (cfg.smtp_security || "ssl") === "starttls" ? "starttls" : "ssl",
        // from_email никогда не приходит от клиента.
        from_email: cfg.from_email,
        from_name: campaign.from_name || cfg.from_name || sender.from_name || "СИНТАГМА",
      };
    } else {
      // org-scope legacy (sender_id = null): SMTP организации.
      const { data: smtpRow, error: smErr } = await admin.rpc("get_decrypted_org_smtp", {
        p_organization_id: campaign.organization_id,
      });
      if (smErr) throw new Error("Ошибка получения SMTP: " + smErr.message);
      const row = (smtpRow || [])[0];
      if (!row) throw new Error("SMTP организации не настроен");
      smtp = {
        host: row.host, port: row.port, username: row.username, password: row.password,
        encryption: row.encryption,
        from_email: row.from_email, from_name: row.from_name,
      };
    }


    const meeting = (campaign.recipient_filter as any)?.meeting || null;
    const dateLabel = meeting?.scheduled_at
      ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(meeting.scheduled_at))
      : "";
    const timeLabel = meeting?.scheduled_at
      ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(meeting.scheduled_at))
      : "";

    const unsubscribeUrl = `${SUPABASE_URL}/functions/v1/email-unsubscribe?t=${recipient.open_token}`;
    const trackUrl = `${SUPABASE_URL}/functions/v1/track-email-open?t=${recipient.open_token}`;

    // ============ Расширенные переменные {{org_name}}, {{plan}}, {{course_count}}, {{last_login}} ============
    let orgName = "";
    let plan = "";
    let courseCount = "";
    let lastLogin = "";

    // Если получатель — организация (по email), пробуем подтянуть инфу
    try {
      const { data: orgRow } = await admin
        .from("organizations")
        .select("id, name, subscription_plan, subscription_plans:subscription_plan(name)")
        .eq("email", recipient.email)
        .maybeSingle();
      if (orgRow) {
        orgName = (orgRow as any).name || "";
        plan = (orgRow as any).subscription_plan || "";
        const { count: cc } = await admin
          .from("courses")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", (orgRow as any).id);
        if (cc !== null && cc !== undefined) courseCount = String(cc);
      }
    } catch (_) { /* optional */ }

    // ============ Переменные курса (linked_course_id) ============
    let courseName = "";
    let courseDuration = "";
    let coursePrice = "";
    let courseUrl = "";
    if ((campaign as any).linked_course_id) {
      try {
        const { data: course } = await admin
          .from("courses")
          .select("title, duration, price, slug, organization_id")
          .eq("id", (campaign as any).linked_course_id)
          .maybeSingle();
        if (course) {
          courseName = (course as any).title || "";
          courseDuration = (course as any).duration || "";
          const p = (course as any).price;
          coursePrice = (p !== null && p !== undefined && Number(p) > 0)
            ? `${Number(p).toLocaleString("ru-RU")} ₽`
            : "Бесплатно";
          const slug = (course as any).slug;
          courseUrl = slug
            ? `https://sintagma.com.ru/c/${slug}`
            : `https://sintagma.com.ru/course/${(campaign as any).linked_course_id}`;
        }
      } catch (_) { /* optional */ }
    }

    // ============ Переменные вебинара (linked_webinar_id) ============
    let webinarTitle = "";
    let webinarDate = "";
    let webinarTime = "";
    let webinarUrl = "";
    if ((campaign as any).linked_webinar_id) {
      try {
        const { data: web } = await admin
          .from("webinars")
          .select("title, scheduled_at, stream_url, kinescope_room_id")
          .eq("id", (campaign as any).linked_webinar_id)
          .maybeSingle();
        if (web) {
          webinarTitle = (web as any).title || "";
          const sa = (web as any).scheduled_at;
          if (sa) {
            webinarDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(sa));
            webinarTime = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(sa));
          }
          webinarUrl = (web as any).stream_url || ((web as any).kinescope_room_id ? `https://kinescope.io/live/${(web as any).kinescope_room_id}` : "");
        }
      } catch (_) { /* optional */ }
    }

    // last_login через профиль (если email совпадает)
    try {
      const { data: prof } = await admin
        .from("profiles")
        .select("last_sign_in_at, organization_id")
        .eq("email", recipient.email)
        .maybeSingle();
      if (prof?.last_sign_in_at) {
        lastLogin = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
          .format(new Date(prof.last_sign_in_at));
      }
      if (!orgName && (prof as any)?.organization_id) {
        const { data: o2 } = await admin.from("organizations")
          .select("name, subscription_plan").eq("id", (prof as any).organization_id).maybeSingle();
        if (o2) {
          orgName = (o2 as any).name || orgName;
          if (!plan) plan = (o2 as any).subscription_plan || "";
        }
      }
    } catch (_) { /* optional */ }

    // Выбор темы по A/B-варианту
    const variant = (recipient as any).subject_variant as ("a" | "b" | null) || null;
    const subject = (variant === "b" && campaign.subject_b)
      ? campaign.subject_b
      : campaign.subject;

    // Этап 2: значения из строки получателя и custom_data, с HTML-экранированием.
    const esc = (v: unknown) =>
      v === null || v === undefined
        ? ""
        : String(v)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    const firstName = (recipient as any).first_name || "";
    const lastName = (recipient as any).last_name || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || recipient.recipient_name || "";
    const customData = ((recipient as any).custom_data || {}) as Record<string, unknown>;

    const values: Record<string, string> = {
      first_name: firstName,
      last_name: lastName,
      organization: (recipient as any).organization || orgName || "",
      position: (recipient as any).position || "",
      city: (recipient as any).city || "",
      name: fullName,
      recipient_name: fullName,
      email: recipient.email,
      company: (recipient as any).organization || recipient.recipient_name || "",
      org_name: orgName,
      plan,
      course_count: courseCount,
      last_login: lastLogin,
      webinar_url: webinarUrl || meeting?.url || "",
      webinar_title: webinarTitle,
      webinar_date: webinarDate || dateLabel,
      webinar_time: webinarTime || timeLabel,
      course_name: courseName,
      course_duration: courseDuration,
      course_price: coursePrice,
      course_url: courseUrl,
      date: dateLabel,
      time: timeLabel,
      host_name: meeting?.host_name || campaign.from_name || "",
      unsubscribe_url: unsubscribeUrl,
    };
    for (const [k, v] of Object.entries(customData)) {
      if (!values[k]) values[k] = v === null || v === undefined ? "" : String(v);
    }

    const substitute = (tpl: string) =>
      tpl.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, key: string) => {
        const raw = values[key];
        if (raw === undefined) return full;
        // URL-переменные не экранируем — они формируются сервером.
        if (key === "unsubscribe_url" || key === "webinar_url" || key === "course_url") return raw;
        return esc(raw);
      });

    let personalizedHtml = substitute(campaign.html_body as string);

    // Тема письма — plain text, экранирование HTML не нужно.
    const personalizedSubject = (subject as string).replace(
      /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
      (full, key: string) => (values[key] === undefined ? full : values[key]),
    );


    personalizedHtml = processCampaignHtml(personalizedHtml, {
      campaignId: campaign.id,
      campaignName: campaign.name,
      recipientToken: recipient.open_token,
      supabaseUrl: SUPABASE_URL,
      utmEnabled: campaign.utm_enabled !== false,
      trackClicks: true,
      unsubscribeUrl,
      fromEmail: smtp.from_email,
    });

    personalizedHtml += `<img src="${trackUrl}" width="1" height="1" alt="" style="display:none" />`;

    // iCal-приглашение, если включено и есть meeting с датой
    const attachments: Attachment[] = [];
    if (meeting?.attach_ics && meeting?.scheduled_at && meeting?.url) {
      const ics = buildIcs({
        uid: `${campaignId}-${recipientId}@sintagma.com.ru`,
        title: meeting.title || campaign.subject || "Презентация Sintagma",
        description: `Ссылка на встречу: ${meeting.url}`,
        url: meeting.url,
        startISO: meeting.scheduled_at,
        durationMinutes: meeting.duration_minutes || 60,
        organizerEmail: smtp.from_email,
        organizerName: meeting.host_name || campaign.from_name || smtp.from_name || undefined,
        attendeeEmail: recipient.email,
      });
      attachments.push({
        filename: "invite.ics",
        content: ics,
        contentType: "text/calendar; method=REQUEST; charset=UTF-8",
      });
    }

    const fromOverride = campaign.from_name
      ? `${campaign.from_name} <${smtp.from_email}>`
      : undefined;

    await sendSmtpEmail(smtp, {
      to: recipient.email,
      subject: personalizedSubject,
      html: personalizedHtml,
      fromOverride,
      replyTo: campaign.reply_to || undefined,
      attachments: attachments.length ? attachments : undefined,
      extraHeaders: {
        ...buildListUnsubscribeHeaders({
          unsubscribeUrl,
          fromEmail: smtp.from_email,
          oneClick: true,
        }),
        "Precedence": "bulk",
      },
    });

    // Помечаем как отправленное
    await admin.from("email_campaign_recipients").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error: null,
    }).eq("id", recipientId);

    // Записываем в базу компаний рассылок (чтобы повторно не слать)
    try {
      await admin.from("broadcast_companies_db").upsert({
        email: (recipient.email as string).toLowerCase(),
        company_name: recipient.recipient_name || null,
        last_sent_at: new Date().toISOString(),
        last_campaign_id: campaignId,
        source: campaign.scope === "platform" ? "platform_campaign" : "org_campaign",
        status: "sent",
      }, { onConflict: "email" });
    } catch (e) { console.warn("broadcast_companies_db upsert failed", (e as Error).message); }

    // Инкрементируем sent_count в кампании
    const { data: c2 } = await admin.from("email_campaigns")
      .select("sent_count").eq("id", campaignId).single();
    await admin.from("email_campaigns").update({
      sent_count: (c2?.sent_count || 0) + 1,
    }).eq("id", campaignId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("send-campaign-email error", msg);

    if (recipientId) {
      try {
        await admin.from("email_campaign_recipients").update({
          status: "failed", error: msg,
        }).eq("id", recipientId);
        if (campaignId) {
          const { data: c2 } = await admin.from("email_campaigns")
            .select("failed_count").eq("id", campaignId).single();
          await admin.from("email_campaigns").update({
            failed_count: (c2?.failed_count || 0) + 1,
          }).eq("id", campaignId);
        }
      } catch (_) { /* ignore */ }
    }

    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, // мягкая ошибка — воркер продолжает
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
