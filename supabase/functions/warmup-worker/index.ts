// Warmup Worker — плавный прогрев ящиков пула рассылки.
//
// Как работает:
//  1. SEND-фаза: для каждой активной почты с warmup_enabled=true считаем,
//     сколько писем должно быть отправлено СЕГОДНЯ:
//        ramp_today = min(warmup_daily_target, warmup_start_count + days_since_start)
//     Если sends_today (в email_sender_pool) < ramp_today — отправляем 1 письмо
//     случайному пиру из пула (тоже активному, тоже в прогреве, кроме себя).
//     Пишем строку в email_warmup_pings с уникальным warmup_id и заголовком X-Warmup-Id.
//  2. CHECK-фаза: берём последние pings без placement, где sent_at >= 3 мин назад,
//     подключаемся по IMAP к ящику ПОЛУЧАТЕЛЯ, ищем письмо по X-Warmup-Id.
//     - в INBOX → placement='inbox', warmup_inbox_count++
//     - в Spam/Junk → MOVE → INBOX, mark seen, placement='spam', warmup_spam_count++
//     - не найдено и старше 60 мин → placement='missing'
//
// Cron должен звать эту функцию каждые ~15 мин.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail, type SmtpConfig } from "../_shared/smtp-sender.ts";
import { connectImap, closeImap, placementFor } from "../_shared/imap-mini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Sender = {
  id: string;
  email: string;
  app_password: string | null;
  host: string;
  port: number;
  encryption: string;
  from_name: string | null;
  is_active: boolean;
  warmup_enabled: boolean;
  warmup_daily_target: number;
  warmup_start_count: number;
  warmup_started_at: string | null;
  sends_today: number;
  sends_reset_at: string;
  imap_host: string | null;
  imap_port: number;
  imap_encryption: string;
};

// Автодополнение IMAP-хоста по SMTP-хосту, если админ не задал.
function deriveImapHost(smtpHost: string): string {
  const h = smtpHost.toLowerCase();
  if (h.startsWith("smtp.")) return "imap." + h.slice(5);
  if (h === "smtp.gmail.com") return "imap.gmail.com";
  if (h === "smtp.yandex.ru") return "imap.yandex.ru";
  if (h === "smtp.mail.ru") return "imap.mail.ru";
  if (h === "smtp.timeweb.ru") return "imap.timeweb.ru";
  return h;
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

// Небольшие «тёплые» тексты, чтобы письма выглядели естественно.
const TOPICS = [
  ["Быстрый вопрос", "Привет! Как думаешь, оптимально сейчас двигаться по плану — или лучше сначала собрать обратную связь?"],
  ["По вчерашнему", "Спасибо, что уделил время. Собрал короткое резюме — если что-то дополнишь, буду рад."],
  ["Пятиминутка", "Смотри, придумал небольшой апдейт по процессу. Если ок — расскажу подробнее на созвоне."],
  ["Идея", "Есть свежая мысль по улучшению отчётности. Хочу обкатать на нашей команде — что скажешь?"],
  ["Подтверждение", "Всё в силе на завтра? Если удобнее перенести — только скажи."],
  ["Итоги недели", "Кратко: закрыли ключевые пункты, остаётся пара мелочей. Разберёмся в понедельник."],
  ["Полезное", "Наткнулся на неплохой материал по теме — переслать?"],
  ["Спасибо", "Быстрый респект за помощь на этой неделе. Реально выручил."],
];

function pickTopic() { return TOPICS[Math.floor(Math.random() * TOPICS.length)]; }

function buildHtml(text: string, warmupId: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5">
    <p>${text}</p>
    <p style="color:#666;font-size:12px;margin-top:24px">— отправлено автоматически (${warmupId.slice(0, 8)})</p>
  </div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const stats = { sent: 0, checked: 0, inbox: 0, spam: 0, missing: 0, errors: [] as string[] };

  try {
    // === CHECK-фаза: пинги без placement, старше 3 мин ===
    const threeMinAgo = new Date(Date.now() - 3 * 60_000).toISOString();
    const { data: pending } = await admin
      .from("email_warmup_pings")
      .select("id, warmup_id, recipient_id, sent_at, attempts")
      .is("placement", null)
      .lt("sent_at", threeMinAgo)
      .order("sent_at", { ascending: true })
      .limit(40);

    if (pending && pending.length) {
      // группируем по получателю, чтобы один IMAP-коннект проверил все свои пинги сразу
      const byRecipient = new Map<string, typeof pending>();
      for (const p of pending) {
        const arr = byRecipient.get(p.recipient_id) || [];
        arr.push(p);
        byRecipient.set(p.recipient_id, arr);
      }

      const recipientIds = [...byRecipient.keys()];
      const { data: recips } = await admin
        .from("email_sender_pool")
        .select("id,email,app_password,host,imap_host,imap_port,imap_encryption,warmup_inbox_count,warmup_spam_count")
        .in("id", recipientIds);

      for (const r of (recips || []) as any[]) {
        const pings = byRecipient.get(r.id) || [];
        if (!r.app_password) {
          for (const p of pings) {
            await admin.from("email_warmup_pings").update({
              attempts: (p.attempts || 0) + 1,
              last_error: "no app_password on recipient",
            }).eq("id", p.id);
          }
          continue;
        }
        const host = r.imap_host || deriveImapHost(r.host);
        let conn;
        try {
          conn = await connectImap({
            host,
            port: r.imap_port || 993,
            user: r.email,
            password: r.app_password,
          });
        } catch (e: any) {
          const msg = String(e?.message || e).slice(0, 250);
          for (const p of pings) {
            await admin.from("email_warmup_pings").update({
              attempts: (p.attempts || 0) + 1,
              last_error: `imap: ${msg}`,
            }).eq("id", p.id);
          }
          stats.errors.push(`imap ${r.email}: ${msg}`);
          continue;
        }

        let inboxDelta = 0, spamDelta = 0;
        for (const p of pings) {
          try {
            const where = await placementFor(conn, p.warmup_id);
            const ageMin = (Date.now() - new Date(p.sent_at).getTime()) / 60_000;
            let final: string | null = where;
            if (where === "missing" && ageMin < 60) final = null; // подождём ещё
            await admin.from("email_warmup_pings").update({
              placement: final,
              checked_at: new Date().toISOString(),
              attempts: (p.attempts || 0) + 1,
              last_error: null,
            }).eq("id", p.id);
            if (final === "inbox") { inboxDelta++; stats.inbox++; }
            else if (final === "spam") { spamDelta++; stats.spam++; }
            else if (final === "missing") stats.missing++;
            stats.checked++;
          } catch (e: any) {
            const msg = String(e?.message || e).slice(0, 250);
            await admin.from("email_warmup_pings").update({
              attempts: (p.attempts || 0) + 1,
              last_error: msg,
            }).eq("id", p.id);
            stats.errors.push(`check ${r.email}: ${msg}`);
          }
        }
        await closeImap(conn);

        if (inboxDelta || spamDelta) {
          await admin.from("email_sender_pool").update({
            warmup_inbox_count: (r.warmup_inbox_count || 0) + inboxDelta,
            warmup_spam_count: (r.warmup_spam_count || 0) + spamDelta,
          }).eq("id", r.id);
        }
      }
    }

    // === SEND-фаза ===
    const { data: pool } = await admin
      .from("email_sender_pool")
      .select("*")
      .eq("is_active", true)
      .eq("warmup_enabled", true);

    const senders = (pool || []) as unknown as Sender[];
    if (senders.length < 2) {
      return new Response(JSON.stringify({ ...stats, note: "нужно ≥2 активных ящика для прогрева" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const today = new Date();
    for (const s of senders) {
      if (!s.app_password) continue;

      // сброс sends_today, если сменилась дата (на всякий случай)
      const resetDate = new Date(s.sends_reset_at);
      let sendsToday = s.sends_today || 0;
      if (resetDate.toDateString() !== today.toDateString()) sendsToday = 0;

      // старт прогрева
      let started = s.warmup_started_at ? new Date(s.warmup_started_at) : null;
      if (!started) {
        started = today;
        await admin.from("email_sender_pool").update({
          warmup_started_at: started.toISOString(),
        }).eq("id", s.id);
      }

      const days = daysBetween(started, today);
      const rampToday = Math.min(
        s.warmup_daily_target || 20,
        (s.warmup_start_count || 1) + days,
      );

      if (sendsToday >= rampToday) continue;

      // Выбираем получателя: случайный другой активный ящик
      const peers = senders.filter(p => p.id !== s.id && p.app_password);
      if (!peers.length) continue;
      const peer = peers[Math.floor(Math.random() * peers.length)];

      const [subject, body] = pickTopic();
      const warmupId = crypto.randomUUID();
      const html = buildHtml(body, warmupId);

      const cfg: SmtpConfig = {
        host: s.host,
        port: s.port,
        username: s.email,
        password: s.app_password,
        encryption: s.encryption || "ssl",
        from_email: s.email,
        from_name: s.from_name || "Синтагма",
      };

      try {
        await sendSmtpEmail(cfg, {
          to: peer.email,
          subject,
          html,
          extraHeaders: {
            "X-Warmup-Id": warmupId,
            "X-Auto-Response-Suppress": "All",
            "Precedence": "bulk",
          },
        });
        await admin.from("email_warmup_pings").insert({
          warmup_id: warmupId,
          sender_id: s.id,
          recipient_id: peer.id,
        });
        // инкрементируем sends_today и total_sent + при необходимости сбрасываем дату
        const patch: any = {
          sends_today: sendsToday + 1,
          total_sent: (s as any).total_sent ? (s as any).total_sent + 1 : 1,
          last_used_at: new Date().toISOString(),
        };
        if (resetDate.toDateString() !== today.toDateString()) {
          patch.sends_reset_at = today.toISOString().slice(0, 10);
        }
        await admin.from("email_sender_pool").update(patch).eq("id", s.id);
        stats.sent++;
      } catch (e: any) {
        const msg = String(e?.message || e).slice(0, 250);
        await admin.from("email_sender_pool").update({
          last_error: `warmup send: ${msg}`,
          last_error_at: new Date().toISOString(),
        }).eq("id", s.id);
        stats.errors.push(`send ${s.email}→${peer.email}: ${msg}`);
      }
    }

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e), stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
