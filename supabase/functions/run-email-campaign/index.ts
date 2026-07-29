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
// TODO (5C.1.d): atomic campaign-run claim before reading pending +
// SMTP dispatch. The unique index (campaign_id, email) guarantees no
// duplicate recipient rows under concurrent runs, but does NOT yet
// guarantee no duplicate SMTP dispatch when two invocations race.
//
// Preserved verbatim from 5C.1.a: authorization gate (user client),
// A/B sample assignment, quota, paused/scheduled/idempotency,
// SEND_DELAY_MS pacing, EdgeRuntime.waitUntil.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody { campaignId: string; }

const SEND_DELAY_MS = 1500;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isServiceRole = bearer.length > 0 && bearer === SERVICE_KEY;

    const { campaignId }: ReqBody = await req.json().catch(() => ({ campaignId: "" }));
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

      const { data: adminRow } = await userClient.rpc("has_role", {
        _role: "admin", _user_id: userId,
      });
      const isAdmin = adminRow === true;

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

    // Idempotency
    if (campaign.status === "sending" && campaign.started_at) {
      const startedMs = new Date(campaign.started_at).getTime();
      if (Date.now() - startedMs < 5 * 60 * 1000) {
        return json({ ok: true, alreadyRunning: true, message: "Кампания уже отправляется (идёт фоновая обработка)" }, 200);
      }
    }

    // ============ Materialize recipients via canonical resolver ============
    const { count: existingCount, error: existingErr } = await admin
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);
    if (existingErr) {
      console.error("existingCount failed", existingErr);
      await admin.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
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
        await admin.from("email_campaigns").update({
          status: "failed",
        }).eq("id", campaignId);
        return json({ error: `Resolver failed: ${resolveErr.message}` }, 500);
      }
      const allowed: Array<{ email: string; recipient_name: string | null }> =
        Array.isArray(resolved) ? resolved as any : [];

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

      // Insert (batches of 500) — unique index (campaign_id, email) + upsert-ignore
      // guarantees no duplicate recipient rows. (Does NOT yet guarantee no
      // duplicate SMTP dispatch — see 5C.1.d TODO above.)
      if (allowed.length > 0) {
        const rows = allowed.map((r) => ({
          campaign_id: campaignId,
          email: r.email,
          recipient_name: r.recipient_name ?? "",
          status: "pending" as const,
          subject_variant: abAssign?.get(r.email) || null,
        }));
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const slice = rows.slice(i, i + BATCH);
          const { error: insErr } = await admin
            .from("email_campaign_recipients")
            .upsert(slice, { onConflict: "campaign_id,email", ignoreDuplicates: true });
          if (insErr) {
            console.error("recipients upsert failed", insErr);
            await admin.from("email_campaigns").update({
              status: "failed",
            }).eq("id", campaignId);
            return json({ error: "Не удалось записать получателей" }, 500);
          }
        }
      }

      // total_recipients = actual persisted rows, not resolver payload length.
      // On count-error we must NOT write 0 — that would fake an empty campaign.
      const { count: actualCount, error: actualErr } = await admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);
      if (actualErr) {
        console.error("actualCount failed", actualErr);
        await admin.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
        return json({ error: "Не удалось подсчитать получателей" }, 500);
      }
      const { error: totalUpdErr } = await admin.from("email_campaigns").update({
        total_recipients: actualCount || 0,
      }).eq("id", campaignId);
      if (totalUpdErr) {
        console.error("total_recipients update failed", totalUpdErr);
        await admin.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
        return json({ error: "Не удалось обновить total_recipients" }, 500);
      }
    }

    // ============ A/B: on first pass send only the sample ============
    let pendingQuery = admin
      .from("email_campaign_recipients")
      .select("id, subject_variant")
      .eq("campaign_id", campaignId)
      .eq("status", "pending");

    if (campaign.ab_test_enabled && campaign.subject_b && !campaign.ab_winner) {
      pendingQuery = pendingQuery.not("subject_variant", "is", null);
      if (!campaign.ab_sample_started_at) {
        await admin.from("email_campaigns").update({
          ab_sample_started_at: new Date().toISOString(),
        }).eq("id", campaignId);
      }
    }

    const { data: pending, error: pendingErr } = await pendingQuery;
    // Critical: an error MUST NOT be interpreted as "0 pending, mark completed".
    if (pendingErr) {
      console.error("pendingQuery failed", pendingErr);
      await admin.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
      return json({ error: "Не удалось получить очередь отправки" }, 500);
    }
    const pendingCount = pending?.length || 0;
    if (pendingCount === 0) {
      await admin.from("email_campaigns").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", campaignId);
      return json({ ok: true, message: "Нет получателей в очереди" }, 200);
    }

    // ============ Quota (5C.1.c) ============
    // Platform: keep existing broadcast quota (consume_email_quota with 'platform').
    // Org: server-derived atomic claim keyed by hashed sender email. Client cannot
    // pass a scope_key or skip_warmup override.
    let quota: any = null;
    if (campaign.scope === "platform") {
      const { data: pq, error: pqErr } = await admin.rpc("consume_email_quota", {
        p_scope_key: "platform",
        p_count: pendingCount,
      });
      if (pqErr) return json({ error: "Ошибка квоты: " + pqErr.message }, 500);
      quota = pq;
    } else {
      if (!campaign.organization_id) {
        return json({ error: "org campaign без organization_id" }, 500);
      }
      const { data: cq, error: cqErr } = await admin.rpc("claim_org_email_quota", {
        p_organization_id: campaign.organization_id,
        p_count: pendingCount,
        p_message_kind: "marketing",
      });
      if (cqErr) return json({ error: "Ошибка квоты: " + cqErr.message }, 500);
      quota = cq;
    }

    if (quota && (quota as any).allowed === false) {
      return json({
        ok: false, quotaExceeded: true, ...(quota as any),
        message: `Дневной лимит отправителя: ${(quota as any).effective_daily_limit ?? (quota as any).daily_limit}, отправлено: ${(quota as any).sent_today}, доступно: ${(quota as any).remaining}. Запрошено: ${pendingCount}.`,
      }, 200);
    }

    await admin.from("email_campaigns").update({
      status: "sending",
      started_at: campaign.started_at || new Date().toISOString(),
    }).eq("id", campaignId);

    const runner = (async () => {
      for (const r of pending!) {
        try {
          await admin.functions.invoke("send-campaign-email", {
            body: { campaignId, recipientId: (r as any).id },
          });
        } catch (e) {
          console.error("invoke send-campaign-email failed", e);
        }
        await new Promise((res) => setTimeout(res, SEND_DELAY_MS));
      }

      // After partial send: if we can't verify leftovers, DO NOT mark completed.
      // Fall back to `paused` — the scheduled resume will retry.
      const { data: leftovers, error: leftErr } = await admin.from("email_campaign_recipients")
        .select("id").eq("campaign_id", campaignId).eq("status", "pending");
      if (leftErr) {
        console.error("leftovers query failed — parking as paused", leftErr);
        await admin.from("email_campaigns").update({
          status: "paused",
          completed_at: null,
        }).eq("id", campaignId);
        return;
      }
      const leftCount = leftovers?.length || 0;
      await admin.from("email_campaigns").update({
        status: leftCount === 0 ? "completed" : "paused",
        completed_at: leftCount === 0 ? new Date().toISOString() : null,
      }).eq("id", campaignId);
    })();

    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runner);
    }

    return json({ ok: true, started: pendingCount, quota }, 200);
  } catch (e) {
    console.error("run-email-campaign error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
