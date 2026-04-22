// Cron: каждые 5 минут проверяет все запланированные вебинары и шлёт email-напоминания
// за 24ч / 1ч / 15мин до начала. Адресаты — все приглашённые (webinar_participants + по access_type).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIERS = [
  { key: "24h", minutes: 24 * 60, windowMin: 30, label: "за 24 часа" },
  { key: "1h", minutes: 60, windowMin: 15, label: "за 1 час" },
  { key: "15m", minutes: 15, windowMin: 5, label: "за 15 минут" },
];

function makeICal(opts: { uid: string; title: string; description: string; start: Date; end: Date; url: string }): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sintagma//Webinar//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(opts.start)}`,
    `DTEND:${fmt(opts.end)}`,
    `SUMMARY:${opts.title.replace(/\n/g, " ")}`,
    `DESCRIPTION:${opts.description.replace(/\n/g, "\\n")}`,
    `URL:${opts.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function buildHtml(title: string, scheduled: string, url: string, label: string, orgName: string) {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#f6f7f9;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
<h2 style="margin:0 0 12px;color:#0f766e;font-size:22px">Напоминание о вебинаре ${label}</h2>
<p style="margin:0 0 8px;font-size:16px"><strong>${title}</strong></p>
<p style="margin:0 0 24px;color:#525252">Начало: <strong>${scheduled}</strong></p>
<a href="${url}" style="display:inline-block;background:#0f766e;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600">Подключиться к вебинару</a>
<p style="margin:24px 0 0;color:#737373;font-size:13px">Во вложении — событие для календаря (.ics).</p>
<p style="margin:8px 0 0;color:#737373;font-size:13px">${orgName}</p>
</div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const baseUrl = Deno.env.get("SITE_URL") || "https://синтагма.рф";
  const now = new Date();
  let processed = 0;
  let sent = 0;
  let errors = 0;

  for (const tier of TIERS) {
    const targetTime = new Date(now.getTime() + tier.minutes * 60_000);
    const lo = new Date(targetTime.getTime() - tier.windowMin * 60_000);
    const hi = new Date(targetTime.getTime() + tier.windowMin * 60_000);

    const { data: webinars } = await supabase
      .from("webinars")
      .select("id, title, description, scheduled_at, duration_minutes, organization_id, public_token, reminders_sent, status, access_type, course_id, company_id")
      .eq("status", "scheduled")
      .gte("scheduled_at", lo.toISOString())
      .lte("scheduled_at", hi.toISOString());

    for (const w of webinars ?? []) {
      processed++;
      const remSent = (w.reminders_sent ?? {}) as Record<string, string>;
      if (remSent[tier.key]) continue;

      // Собираем emails адресатов
      const emails = new Set<string>();

      // 1) явные участники
      const { data: parts } = await supabase
        .from("webinar_participants").select("user_id").eq("webinar_id", w.id);
      const userIds = (parts ?? []).map((p) => p.user_id);

      // 2) по access_type
      if (w.access_type === "course" && w.course_id) {
        const { data: enr } = await supabase
          .from("enrollments").select("user_id").eq("course_id", w.course_id).in("status", ["active", "completed"]);
        for (const e of enr ?? []) userIds.push(e.user_id);
      } else if (w.access_type === "org_all") {
        const { data: orgUsers } = await supabase
          .from("profiles").select("user_id").eq("organization_id", w.organization_id);
        for (const e of orgUsers ?? []) userIds.push(e.user_id);
      } else if (w.access_type === "company" && w.company_id) {
        const { data: cu } = await supabase
          .from("profiles").select("user_id").eq("company_id", w.company_id);
        for (const e of cu ?? []) userIds.push(e.user_id);
      }

      const uniqueIds = Array.from(new Set(userIds));
      if (uniqueIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("email").in("user_id", uniqueIds);
        for (const p of profs ?? []) {
          if (p.email && /@/.test(p.email) && !p.email.endsWith("@student.local")) emails.add(p.email);
        }
      }

      if (emails.size === 0) {
        await supabase.from("webinars").update({
          reminders_sent: { ...remSent, [tier.key]: new Date().toISOString() },
        }).eq("id", w.id);
        continue;
      }

      const { data: org } = await supabase.from("organizations").select("name").eq("id", w.organization_id).maybeSingle();
      const orgName = org?.name ?? "Синтагма";
      const url = w.public_token ? `${baseUrl}/w/${w.public_token}` : `${baseUrl}/webinar/${w.id}/live`;
      const scheduledMsk = new Date(w.scheduled_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "long", timeStyle: "short" });
      const html = buildHtml(w.title, scheduledMsk, url, tier.label, orgName);
      const ical = makeICal({
        uid: `webinar-${w.id}@sintagma`,
        title: w.title,
        description: `${w.description || ""}\n\nПодключиться: ${url}`,
        start: new Date(w.scheduled_at),
        end: new Date(new Date(w.scheduled_at).getTime() + (w.duration_minutes || 60) * 60_000),
        url,
      });
      const icalB64 = btoa(unescape(encodeURIComponent(ical)));

      // отправка через send-email с iCal вложением (через альтернативный путь — multipart)
      // т.к. send-email не поддерживает attachments, шлём отдельным письмом (HTML с inline-ссылкой) +
      // дублируем .ics inline через data: URL в кнопке "Добавить в календарь"
      // Простой вариант: вложение через X-Mailer raw — пока используем data: URL
      const downloadIcal = `data:text/calendar;base64,${icalB64}`;
      const htmlWithIcal = html.replace(
        "</div></body>",
        `<div style="margin-top:16px"><a href="${downloadIcal}" download="webinar.ics" style="color:#0f766e;font-size:13px;text-decoration:underline">📅 Добавить в календарь (.ics)</a></div></div></body>`,
      );

      for (const to of emails) {
        try {
          const r = await supabase.functions.invoke("send-email", {
            body: {
              to,
              subject: `Напоминание ${tier.label}: ${w.title}`,
              html: htmlWithIcal,
              from: `${orgName} <noreply@sintagma.com.ru>`,
            },
          });
          if (r.error) { errors++; console.error("send-email", to, r.error.message); }
          else sent++;
        } catch (e) {
          errors++;
          console.error("reminder send fail", to, e);
        }
      }

      await supabase.from("webinars").update({
        reminders_sent: { ...remSent, [tier.key]: new Date().toISOString() },
      }).eq("id", w.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, sent, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
