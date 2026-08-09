// Closed deliverability worker for organization mailing senders.
//
// It sends explicit automated probes from a verified organization sender to
// organization-owned seed inboxes, then performs read-only IMAP placement
// checks. It never sends from a seed inbox, reads message bodies, marks mail as
// read, replies, stars, deletes, or moves messages between folders.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { closeImap, connectImap, placementForReadOnly } from "../_shared/imap-mini.ts";
import { sendSmtpEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MVP_DAILY_CAP = 10;
const BUSINESS_START_MINUTE = 9 * 60;
const BUSINESS_END_MINUTE = 20 * 60;
const MIN_CHECK_AGE_MS = 2 * 60_000;
const MISSING_AFTER_MS = 60 * 60_000;

type ErrorCategory = "auth" | "connection" | "tls" | "timeout" | "config" | "unknown";

type Sender = {
  id: string;
  organization_id: string;
  from_email: string;
  from_name: string | null;
  smtp_status: string;
  is_active: boolean;
  warmup_enabled: boolean;
  warmup_daily_target: number;
  warmup_start_count: number;
  warmup_started_at: string | null;
};

type Seed = {
  id: string;
  organization_id: string;
  email: string;
  provider: string;
  auth_status: string;
  is_active: boolean;
};

function categorize(message: string): ErrorCategory {
  const m = message.toLowerCase();
  if (/timeout|timed out/.test(m)) return "timeout";
  if (/535|534|auth|login|credential|invalid password/.test(m)) return "auth";
  if (/tls|ssl|certificate/.test(m)) return "tls";
  if (/connect|refused|dns|unreachable|host|closed/.test(m)) return "connection";
  if (/config|missing|required/.test(m)) return "config";
  return "unknown";
}

function moscowClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  const minuteOfDay = Number(value("hour")) * 60 + Number(value("minute"));
  return { date, minuteOfDay };
}

function dateKeyAtMoscow(iso: string) {
  return moscowClock(new Date(iso)).date;
}

function daysBetweenDateKeys(from: string, to: string) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

function dueSlots(ramp: number, minuteOfDay: number, force: boolean) {
  if (force) return ramp;
  if (minuteOfDay < BUSINESS_START_MINUTE) return 0;
  if (minuteOfDay >= BUSINESS_END_MINUTE) return ramp;
  const elapsed = minuteOfDay - BUSINESS_START_MINUTE;
  const duration = BUSINESS_END_MINUTE - BUSINESS_START_MINUTE;
  return Math.min(ramp, Math.floor((elapsed * ramp) / duration) + 1);
}

function probeHtml(probeId: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">
    <p>Это автоматическое контрольное письмо СИНТАГМЫ для проверки размещения во входящих.</p>
    <p style="color:#6b7280;font-size:12px">Идентификатор проверки: ${probeId.slice(0, 8)}</p>
  </div>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stats = {
    sent: 0,
    checked: 0,
    inbox: 0,
    spam: 0,
    missing: 0,
    failed: 0,
    skipped: 0,
    error_categories: [] as string[],
  };

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const expectedCronSecret = Deno.env.get("MAILING_DELIVERABILITY_CRON_SECRET") || "";
    const suppliedCronSecret = req.headers.get("X-Cron-Secret") || "";
    const cronAuthorized = expectedCronSecret.length >= 24 && suppliedCronSecret === expectedCronSecret;
    const body = await req.json().catch(() => ({}));
    const requestedSenderId = typeof body?.sender_id === "string" ? body.sender_id : "";
    const force = body?.force === true;

    const admin = createClient(url, serviceKey);

    if (!cronAuthorized) {
      const authHeader = req.headers.get("Authorization") || "";
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: authData } = await userClient.auth.getUser();
      if (!authData?.user) return json({ error: "Unauthorized" }, 401);
      if (!requestedSenderId) return json({ error: "sender_id required" }, 400);

      const { data: requestedSender } = await admin
        .from("mailing_senders")
        .select("organization_id")
        .eq("id", requestedSenderId)
        .maybeSingle();
      if (!requestedSender) return json({ error: "Forbidden" }, 403);

      const { data: isAdmin } = await userClient.rpc("has_role", {
        _user_id: authData.user.id,
        _role: "admin",
      });
      let allowed = !!isAdmin;
      if (!allowed) {
        const { data: canAccess } = await userClient.rpc("can_access_organization", {
          _organization_id: requestedSender.organization_id,
          _permission: "email.manage",
        });
        allowed = !!canAccess;
      }
      if (!allowed) return json({ error: "Forbidden" }, 403);
    }

    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - MIN_CHECK_AGE_MS).toISOString();

    // Check already sent probes first, grouped by receive-only seed inbox.
    let pendingQuery = admin
      .from("mailing_deliverability_checks")
      .select("id,probe_id,seed_id,sent_at,attempts")
      .eq("status", "sent")
      .not("sent_at", "is", null)
      .lte("sent_at", twoMinutesAgo)
      .order("sent_at", { ascending: true })
      .limit(40);
    if (requestedSenderId) pendingQuery = pendingQuery.eq("sender_id", requestedSenderId);
    const { data: pending } = await pendingQuery;

    const pendingBySeed = new Map<string, typeof pending>();
    for (const check of pending || []) {
      const rows = pendingBySeed.get(check.seed_id) || [];
      rows.push(check);
      pendingBySeed.set(check.seed_id, rows);
    }

    for (const [seedId, checks] of pendingBySeed) {
      const { data: secretRows, error: secretError } = await admin.rpc(
        "get_mailing_deliverability_seed_secret",
        { p_seed_id: seedId },
      );
      const seed = Array.isArray(secretRows) ? secretRows[0] : secretRows;
      if (secretError || !seed?.secret) {
        for (const check of checks || []) {
          await admin.from("mailing_deliverability_checks").update({
            attempts: (check.attempts || 0) + 1,
            error_category: "config",
            last_error: "seed configuration unavailable",
          }).eq("id", check.id);
        }
        stats.error_categories.push("seed:config");
        continue;
      }

      let connection;
      try {
        connection = await connectImap({
          host: seed.imap_host,
          port: seed.imap_port || 993,
          user: seed.imap_username || seed.email,
          password: seed.secret,
        });
        for (const check of checks || []) {
          const placement = await placementForReadOnly(connection, check.probe_id);
          const age = now.getTime() - new Date(check.sent_at!).getTime();
          const finalPlacement = placement === "missing" && age < MISSING_AFTER_MS ? null : placement;
          await admin.from("mailing_deliverability_checks").update({
            status: finalPlacement || "sent",
            placement: finalPlacement,
            checked_at: new Date().toISOString(),
            attempts: (check.attempts || 0) + 1,
            error_category: null,
            last_error: null,
          }).eq("id", check.id);

          stats.checked += 1;
          if (finalPlacement === "inbox") stats.inbox += 1;
          if (finalPlacement === "spam") stats.spam += 1;
          if (finalPlacement === "missing") stats.missing += 1;
        }
        await admin.from("mailing_deliverability_seeds").update({
          last_checked_at: new Date().toISOString(),
        }).eq("id", seedId);
      } catch (error) {
        const category = categorize((error as Error)?.message || "");
        for (const check of checks || []) {
          await admin.from("mailing_deliverability_checks").update({
            attempts: (check.attempts || 0) + 1,
            error_category: category,
            last_error: `IMAP ${category}`,
          }).eq("id", check.id);
        }
        if (category === "auth") {
          await admin.from("mailing_deliverability_seeds").update({
            auth_status: "error",
            error_category: category,
          }).eq("id", seedId);
        }
        stats.error_categories.push(`imap:${category}`);
      } finally {
        if (connection) await closeImap(connection);
      }
    }

    let senderQuery = admin
      .from("mailing_senders")
      .select(
        "id,organization_id,from_email,from_name,smtp_status,is_active,warmup_enabled,warmup_daily_target,warmup_start_count,warmup_started_at",
      )
      .eq("is_active", true)
      .eq("smtp_status", "ok")
      .eq("warmup_enabled", true);
    if (requestedSenderId) senderQuery = senderQuery.eq("id", requestedSenderId);
    const { data: senderRows } = await senderQuery;
    const senders = (senderRows || []) as Sender[];
    const clock = moscowClock(now);

    for (const sender of senders) {
      const { data: seedRows } = await admin
        .from("mailing_deliverability_seeds")
        .select("id,organization_id,email,provider,auth_status,is_active")
        .eq("organization_id", sender.organization_id)
        .eq("is_active", true)
        .eq("auth_status", "ok")
        .order("provider", { ascending: true })
        .order("email", { ascending: true });
      const seeds = (seedRows || []) as Seed[];
      if (!seeds.length) {
        stats.skipped += 1;
        await admin.from("mailing_senders").update({
          warmup_paused_reason: "Нет проверенных контрольных ящиков",
          warmup_last_run_at: now.toISOString(),
        }).eq("id", sender.id);
        continue;
      }

      let startedAt = sender.warmup_started_at;
      if (!startedAt) {
        startedAt = now.toISOString();
        await admin.from("mailing_senders").update({ warmup_started_at: startedAt }).eq("id", sender.id);
      }

      const days = daysBetweenDateKeys(dateKeyAtMoscow(startedAt), clock.date);
      const target = Math.min(MVP_DAILY_CAP, Math.max(1, sender.warmup_daily_target || MVP_DAILY_CAP));
      const start = Math.min(target, Math.max(1, sender.warmup_start_count || 1));
      const ramp = Math.min(target, start + days);
      const due = dueSlots(ramp, clock.minuteOfDay, force);

      const { data: todayRows } = await admin
        .from("mailing_deliverability_checks")
        .select("id,slot_index")
        .eq("sender_id", sender.id)
        .eq("run_date", clock.date)
        .order("slot_index", { ascending: true });
      const completedSlots = todayRows?.length || 0;
      if (completedSlots >= due || completedSlots >= target) {
        stats.skipped += 1;
        await admin.from("mailing_senders").update({
          warmup_paused_reason: null,
          warmup_last_run_at: now.toISOString(),
        }).eq("id", sender.id);
        continue;
      }

      const slotIndex = completedSlots + 1;
      const seed = seeds[(slotIndex - 1) % seeds.length];
      const { data: check, error: claimError } = await admin
        .from("mailing_deliverability_checks")
        .insert({
          organization_id: sender.organization_id,
          sender_id: sender.id,
          seed_id: seed.id,
          run_date: clock.date,
          slot_index: slotIndex,
          status: "sending",
        })
        .select("id,probe_id")
        .maybeSingle();
      if (claimError || !check) {
        stats.skipped += 1;
        continue;
      }

      try {
        const { data: senderSecretRows, error: senderSecretError } = await admin.rpc(
          "get_mailing_sender_secret",
          { p_sender_id: sender.id },
        );
        const cfg = Array.isArray(senderSecretRows) ? senderSecretRows[0] : senderSecretRows;
        if (senderSecretError || !cfg?.secret || cfg.organization_id !== sender.organization_id) {
          throw new Error("config: sender secret unavailable");
        }

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
          {
            to: seed.email,
            subject: `СИНТАГМА: контроль доставки ${check.probe_id.slice(0, 8)}`,
            html: probeHtml(check.probe_id),
            extraHeaders: {
              "X-Warmup-Id": check.probe_id,
              "X-Sintagma-Deliverability-Id": check.probe_id,
              "Auto-Submitted": "auto-generated",
              "X-Auto-Response-Suppress": "All",
            },
          },
        );

        await admin.from("mailing_deliverability_checks").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_category: null,
          last_error: null,
        }).eq("id", check.id);
        await admin.from("mailing_senders").update({
          warmup_paused_reason: null,
          warmup_last_run_at: now.toISOString(),
        }).eq("id", sender.id);
        stats.sent += 1;
      } catch (error) {
        const category = categorize((error as Error)?.message || "");
        await admin.from("mailing_deliverability_checks").update({
          status: "failed",
          error_category: category,
          last_error: `SMTP ${category}`,
        }).eq("id", check.id);
        const fatal = category === "auth" || category === "tls" || category === "config";
        await admin.from("mailing_senders").update({
          warmup_enabled: fatal ? false : sender.warmup_enabled,
          warmup_paused_reason: `SMTP ${category}`,
          warmup_last_run_at: now.toISOString(),
        }).eq("id", sender.id);
        stats.failed += 1;
        stats.error_categories.push(`smtp:${category}`);
      }
    }

    return json(stats);
  } catch {
    return json({ ...stats, error: "worker_failed" }, 500);
  }
});
