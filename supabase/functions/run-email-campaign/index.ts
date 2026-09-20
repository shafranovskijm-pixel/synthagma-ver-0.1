// =====================================================================
// Phase 5C.1.b.1 — corrective updates on top of 5C.1.b.
//
// Hardened error handling: every critical SELECT/COUNT/UPDATE now
// checks its `error` field. A failure NEVER downgrades the campaign
// to `completed` with total_recipients=0. Resolver / count / pending /
// leftover errors surface as `failed` (before send) or `paused`
// (after partial send) with a diagnostic 500. Internal SQL error
// details are logged server-side and not echoed back to the caller.
//
// Ordinary runs and SMTP attempts are durable, token-owned claims.
// An abandoned or uncertain attempt is never automatically reclaimed.
//
// Preserved verbatim from 5C.1.a: authorization gate (user client),
// A/B sample assignment, quota, paused/scheduled/idempotency,
// SEND_DELAY_MS pacing, EdgeRuntime.waitUntil.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hasVerifiedAdminRole } from "./admin-role.ts";
import { platformSenderId, platformSmtp } from "../_shared/platform-sender.ts";
import { dispatchOrdinaryBatch, requireQuotaDecision } from "./run-lifecycle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody { campaignId: string; consent_confirmed?: boolean; }

const SEND_DELAY_MS = 1500;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let finishOwnedRun: ((outcome: string, reason?: string) => Promise<any>) | null = null;
  let quotaRequested = false;
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isServiceRole = bearer.length > 0 && bearer === SERVICE_KEY;

    const body: ReqBody = await req.json().catch(() => ({ campaignId: "" }));
    const campaignId = body.campaignId;
    const consentConfirmed = body.consent_confirmed === true;
    if (!campaignId) return json({ error: "campaignId required" }, 400);

    // ============ AUTHORIZATION GATE (5C.1.a) ============
    const { data: campaign, error: campErr } = await admin
      .from("email_campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (campErr) {
      console.error("campaign lookup failed", campErr);
      return json({ error: "Ошибка загрузки кампании" }, 500);
    }

    let authorized = false;
    if (isServiceRole) {
      authorized = true;
    } else {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const userId = userData.user.id;

      // PostgREST cannot choose between the two named-argument has_role
      // overloads. Read the verified caller's existing role under the same
      // user JWT/RLS instead; never trust a role or user id from the request.
      let isAdmin: boolean;
      try {
        isAdmin = await hasVerifiedAdminRole(userClient, userId);
      } catch {
        console.error("run-email-campaign: verified admin role lookup failed");
        return json({ error: "Не удалось проверить права запуска рассылки" }, 500);
      }

      if (!campaign) {
        authorized = false;
      } else if (campaign.scope === "platform") {
        authorized = isAdmin;
      } else if (campaign.scope === "org" && campaign.organization_id) {
        if (isAdmin) {
          authorized = true;
        } else {
          const { data: writeRow } = await userClient.rpc("can_access_organization", {
            _organization_id: campaign.organization_id,
            _permission: "sales.write",
          });
          authorized = writeRow === true;
        }
      }
    }

    if (!authorized) return json({ error: "Forbidden" }, 403);
    if (!campaign) return json({ error: "Кампания не найдена" }, 404);

    // Read-only preflight: never consume quota/materialize if the explicitly
    // selected platform mailbox is absent, disabled or malformed.
    const selectedPoolId = platformSenderId(campaign.scope, campaign.recipient_filter);
    if (selectedPoolId) {
      const { data: pool, error: poolError } = await admin.from("email_sender_pool")
        .select("id,email,app_password,host,port,encryption,from_name,is_active,daily_limit,sends_today,sends_reset_at,total_sent,updated_at")
        .eq("id", selectedPoolId).maybeSingle();
      if (poolError) return json({ error: "Не удалось проверить выбранного отправителя" }, 500);
      const selectedSmtp = platformSmtp(pool, campaign.from_name);
      if (campaign.reply_to?.trim() && campaign.reply_to.trim().toLowerCase() !== selectedSmtp.from_email.trim().toLowerCase()) {
        return json({ error: "Для сохранения ответов Reply-To должен совпадать с выбранным почтовым ящиком" }, 400);
      }
    } else if (campaign.scope === "platform") {
      if (!["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"].every((key) => Deno.env.get(key))) {
        return json({ error: "Платформенный SMTP не настроен" }, 400);
      }
    }

    // ============ Sender validation (before materialize + quota) ============
    // Для org-кампании с sender_id аккаунт обязан принадлежать той же
    // организации, быть активным и пройти SMTP-проверку.
    let mailingSenderId: string | null = null;
    let requestedBy: string | null = null;
    if (!isServiceRole) {
      const { data: userData } = await createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      }).auth.getUser();
      requestedBy = userData?.user?.id ?? null;
    }
    if (campaign.scope === "org" && (campaign as any).sender_id) {
      const { data: sender, error: sndErr } = await admin
        .from("mailing_senders")
        .select("id, organization_id, is_active, smtp_status")
        .eq("id", (campaign as any).sender_id)
        .maybeSingle();
      if (sndErr) return json({ error: "Не удалось проверить отправителя" }, 500);
      if (!sender) return json({ error: "Отправитель не найден" }, 400);
      if (!campaign.organization_id || sender.organization_id !== campaign.organization_id) {
        return json({ error: "Отправитель принадлежит другой организации" }, 403);
      }
      if (sender.is_active !== true) return json({ error: "Отправитель отключён" }, 400);
      if (sender.smtp_status !== "ok") {
        return json({ error: "Отправитель не прошёл SMTP-проверку" }, 400);
      }
      mailingSenderId = sender.id as string;
    }

    if ((campaign as any).delivery_mode === "fast_2_day") {
      return json({ error: "fast_2_day campaigns must use prepare-fast-campaign" }, 409);
    }
    const isColdOutreach = (campaign as any).campaign_mode === "cold_outreach";
    if (isColdOutreach && !(campaign as any).operator_attested_at) {
      return json({ error: "cold_outreach_attestation_required" }, 400);
    }

    if (!isColdOutreach) {
    // ============ Consent gate (P0 follow-up) ============
    // Initial user launch: явное заявление авторизованного пользователя в body.
    // Resume пользователем (paused / зависший sending) и любой service-role
    // вызов (scheduler / автодосыл) требуют УЖЕ сохранённого подтверждения.
    // Любое несоответствие -> 400 БЕЗ materialize / quota / status mutations.
    const isResumeStatus = campaign.status === "paused" || campaign.status === "sending";
    const storedConsentAt = (campaign as any).consent_confirmed_at as string | null;

    if (isServiceRole || isResumeStatus) {
      if (!storedConsentAt || campaign.recipient_filter?.draft_consent_confirmed === false) {
        return json({
          error: "Согласие получателей не подтверждено — запуск невозможен",
          consentRequired: true,
        }, 400);
      }
    } else {
      if (!consentConfirmed) {
        return json({
          error: "Требуется подтверждение согласия получателей (consent_confirmed)",
          consentRequired: true,
        }, 400);
      }
      // Consent audit and claim are recorded together in the claim RPC.
    }
    }

    // ============ Pre-materialize content / target checks ============
    // Ничего не мутируем, если кампания заведомо не готова к отправке.
    if (
      !String(campaign.name || "").trim() ||
      !String(campaign.subject || "").trim() ||
      !String(campaign.html_body || "").trim()
    ) {
      return json({ error: "Кампания не заполнена: нужны название, тема и тело письма" }, 400);
    }
    if (!campaign.recipient_source || campaign.recipient_source === "none") {
      return json({ error: "Не выбраны получатели кампании" }, 400);
    }


    // The DB checks the version, state, consent, due time and managed-job path
    // under the same lock. No five-minute lease expiry or automatic recovery.
    const runToken = crypto.randomUUID();
    const { data: claim, error: claimError } = await admin.rpc("claim_ordinary_campaign_run", {
      p_campaign_id: campaignId, p_token: runToken,
      p_expected_updated_at: campaign.updated_at,
      p_is_service_role: isServiceRole,
      p_consent_confirmed: consentConfirmed, p_requested_by: requestedBy,
    });
    if (claimError) return json({ error: "Не удалось подтвердить захват запуска; повторная отправка не выполнялась" }, 503);
    if (claim?.claimed !== true) return json({ ok: false, started: 0, reason: claim?.reason || "claim_rejected" }, 409);
    finishOwnedRun = async (outcome, reason) => {
      const { data, error } = await admin.rpc("finish_ordinary_campaign_run", {
        p_campaign_id: campaignId, p_token: runToken, p_outcome: outcome, p_reason: reason || null,
      });
      if (error || data?.finished !== true) throw new Error("Не удалось подтвердить завершение запуска");
      // The finish transaction stores a durable report event. Telegram failure
      // cannot rewrite an SMTP result or restart this run; the outbox is retried
      // only while pending by the existing scheduled report flush.
      try {
        const report = await admin.functions.invoke("notify-mailing-campaign-report", {
          body: { campaignId },
        });
        if (report.error || report.data?.ok !== true) console.warn("ordinary mail report remains pending or requires review");
      } catch { console.warn("ordinary mail report invocation unavailable"); }
      return data;
    };

    // ============ Materialize recipients via canonical resolver ============
    const { count: existingCount, error: existingErr } = await admin
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);
    if (existingErr || typeof existingCount !== "number") {
      console.error("existingCount failed", existingErr);
      await finishOwnedRun("preflight_failed", "recipient_read_failed");
      return json({ error: "Не удалось проверить существующих получателей" }, 500);
    }

    if ((existingCount || 0) === 0) {
      // Canonical resolver — dedup, invalid-email filter and suppressions
      // are ALL applied server-side inside resolve_campaign_recipients.
      const { data: resolved, error: resolveErr } = await admin.rpc(
        "resolve_campaign_recipients",
        { p_campaign_id: campaignId },
      );
      if (resolveErr) {
        // Do NOT swallow into a completed/empty campaign — surface as failed.
        console.error("resolve_campaign_recipients failed", resolveErr);
        await finishOwnedRun("preflight_failed", "resolver_failed");
        return json({ error: "Не удалось определить получателей" }, 500);
      }
      if (!Array.isArray(resolved)) throw new Error("resolver_result_unknown");
      const allowed: Array<{ email: string; recipient_name: string | null }> = resolved;

      // A/B sample assignment
      let abAssign: Map<string, "a" | "b"> | null = null;
      if (campaign.ab_test_enabled && campaign.subject_b) {
        abAssign = new Map();
        const samplePct = Math.max(5, Math.min(50, campaign.ab_sample_percent || 20));
        const sampleSize = Math.max(2, Math.floor((allowed.length * samplePct) / 100));
        const indices = allowed.map((_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        for (let k = 0; k < sampleSize && k < indices.length; k++) {
          const idx = indices[k];
          abAssign.set(allowed[idx].email, k % 2 === 0 ? "a" : "b");
        }
      }

      // One SQL statement: a batch-2 error must not leave a truncated audience
      // which a later run could mistake for the complete materialized list.
      if (allowed.length > 0) {
        const rows = allowed.map((r) => ({
          campaign_id: campaignId,
          email: r.email,
          recipient_name: r.recipient_name ?? "",
          status: "pending" as const,
          subject_variant: abAssign?.get(r.email) || null,
        }));
        const { error: insErr } = await admin.from("email_campaign_recipients")
          .upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true });
        if (insErr) {
          console.error("recipients upsert failed", insErr);
          await finishOwnedRun("preflight_failed", "recipient_write_failed");
          return json({ error: "Не удалось записать получателей" }, 500);
        }
      }

      // total_recipients = actual persisted rows, not resolver payload length.
      // On count-error we must NOT write 0 — that would fake an empty campaign.
      const { count: actualCount, error: actualErr } = await admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);
      if (actualErr || typeof actualCount !== "number") {
        console.error("actualCount failed", actualErr);
        await finishOwnedRun("preflight_failed", "recipient_count_failed");
        return json({ error: "Не удалось подсчитать получателей" }, 500);
      }
      const { error: totalUpdErr } = await admin.from("email_campaigns").update({
        total_recipients: actualCount || 0,
      }).eq("id", campaignId);
      if (totalUpdErr) {
        console.error("total_recipients update failed", totalUpdErr);
        await finishOwnedRun("preflight_failed", "recipient_total_failed");
        return json({ error: "Не удалось обновить total_recipients" }, 500);
      }
      // P0: initial launch с нулём разрешённых получателей НЕ считается
      // завершённой кампанией — она остаётся черновиком.
      if ((actualCount || 0) === 0) {
        await finishOwnedRun("preflight_failed", "empty_audience");
        return json({
          error: "После фильтрации не осталось ни одного получателя — кампания оставлена черновиком",
          emptyAudience: true,
        }, 400);
      }
    }
    const wasInitialMaterialization = (existingCount || 0) === 0;

    // ============ A/B: on first pass send only the sample ============
    let pendingQuery = admin
      .from("email_campaign_recipients")
      .select("id, subject_variant")
      .eq("campaign_id", campaignId)
      .eq("status", "pending");

    if (campaign.ab_test_enabled && campaign.subject_b && !campaign.ab_winner) {
      pendingQuery = pendingQuery.not("subject_variant", "is", null);
    }

    const { data: pending, error: pendingErr } = await pendingQuery;
    // Critical: an error MUST NOT be interpreted as "0 pending, mark completed".
    if (pendingErr || !Array.isArray(pending)) {
      console.error("pendingQuery failed", pendingErr);
      await finishOwnedRun("preflight_failed", "pending_read_failed");
      return json({ error: "Не удалось получить очередь отправки" }, 500);
    }
    const pendingCount = pending?.length || 0;
    if (pendingCount === 0) {
      if (wasInitialMaterialization) {
        // Initial launch: пустая очередь -> остаётся черновиком, не completed.
        await finishOwnedRun("preflight_failed", "empty_pending");
        return json({
          error: "Нет получателей для отправки — кампания оставлена черновиком",
          emptyAudience: true,
        }, 400);
      }
      await finishOwnedRun("completed", "no_selected_pending");
      return json({ ok: true, message: "Нет получателей в очереди" }, 200);
    }

    // ============ Quota ============
    // Platform: keep existing broadcast quota (consume_email_quota with 'platform').
    // Org + sender_id: atomic reservation against the connected mailing_sender.
    // Org legacy (sender_id = null): keep claim_org_email_quota.
    let quota: any = null;
    let campaignLedgerId: string | null = null;
    // Once requested, an RPC/network error is an UNKNOWN reservation, not a
    // reason to consume again or refund automatically on the next cron tick.
    quotaRequested = true;
    if (campaign.scope === "platform") {
      const { data: pq, error: pqErr } = await admin.rpc("consume_email_quota", {
        p_scope_key: "platform",
        p_count: pendingCount,
      });
      if (pqErr) throw new Error("quota_unknown");
      quota = pq;
    } else if (mailingSenderId) {
      const { data: rq, error: rqErr } = await admin.rpc("reserve_mailing_campaign_quota", {
        p_sender_id: mailingSenderId,
        p_campaign_id: campaignId,
        p_count: pendingCount,
        p_requested_by: requestedBy,
      });
      if (rqErr) throw new Error("quota_unknown");
      const reservation = Array.isArray(rq) ? rq[0] : rq;
      quota = reservation;
      requireQuotaDecision(quota);
      if (quota.allowed === true) {
        if (typeof reservation.ledger_id !== "string" || !reservation.ledger_id) throw new Error("quota_ledger_unknown");
        campaignLedgerId = reservation.ledger_id;
      }
    } else {
      if (!campaign.organization_id) {
        throw new Error("org_without_organization");
      }
      const { data: cq, error: cqErr } = await admin.rpc("claim_org_email_quota", {
        p_organization_id: campaign.organization_id,
        p_count: pendingCount,
        p_message_kind: "marketing",
      });
      if (cqErr) throw new Error("quota_unknown");
      quota = cq;
    }

    requireQuotaDecision(quota);
    if (quota.allowed === false) {
      await finishOwnedRun("paused", "quota_denied");
      return json({
        ok: false, quotaExceeded: true, ...(quota as any),
        message: `Дневной лимит отправителя: ${(quota as any).effective_daily_limit ?? (quota as any).daily_limit}, доступно: ${(quota as any).remaining ?? 0}. Запрошено: ${pendingCount}.`,
      }, 200);
    }


    if (campaign.ab_test_enabled && campaign.subject_b && !campaign.ab_winner && !campaign.ab_sample_started_at) {
      const { error: sampleError } = await admin.from("email_campaigns").update({
        ab_sample_started_at: new Date().toISOString(),
      }).eq("id", campaignId);
      if (sampleError) throw new Error("sample_timestamp_unknown");
    }

    const finish = finishOwnedRun;
    const runner = (async () => {
      try {
        const batch = await dispatchOrdinaryBatch(pending!, {
          invoke: (recipientId) => admin.functions.invoke("send-campaign-email", {
            body: { campaignId, recipientId, runToken },
          }),
          wait: () => new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS)),
        });
        // Only explicit, durably recorded recipient results enter accounting.
        // A response timeout may hide an SMTP acceptance; stop, do not retry.
        if (batch.uncertain) {
          await finish("uncertain", "dispatch_result_unknown");
          return;
        }
        if (campaignLedgerId) {
          const { error } = await admin.rpc("record_mailing_campaign_result", {
            p_ledger_id: campaignLedgerId, p_sent: batch.sent, p_failed: batch.failed,
          });
          if (error) throw new Error("result_accounting_unknown");
        }
        // Counts/status are recomputed under the claim lock; A/B leftovers,
        // in-flight attempts and uncertainty can never become 'completed'.
        await finish("completed", "batch_finished");
      } catch (error) {
        console.error("ordinary run stopped", error);
        try { await finish("uncertain", "run_result_unknown"); }
        catch { /* The durable active claim remains locked for manual review. */ }
      }
    })();

    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runner);
    } else {
      await runner;
    }

    return json({ ok: true, started: pendingCount, quota }, 200);
  } catch (e) {
    console.error("run-email-campaign error", e);
    if (finishOwnedRun) {
      try { await finishOwnedRun(quotaRequested ? "uncertain" : "preflight_failed", quotaRequested ? "quota_or_run_unknown" : "preflight_exception"); }
      catch { /* Never unlock/retry an unconfirmed finalization. */ }
    }
    return json({ error: "Рассылка не запущена или остановлена: требуется проверка состояния" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
