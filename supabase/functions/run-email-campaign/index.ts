// =====================================================================
// Phase 5C.1.b — canonical recipient resolver.
// Recipient list is computed exclusively by the SQL RPC
// public.resolve_campaign_recipients(campaign_id). The Edge Function no
// longer contains its own resolveRecipients(); dedup, invalid-email
// filtering and suppressions are all handled by the RPC so that preview
// and materialization stay consistent.
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
    const { data: campaign } = await admin
      .from("email_campaigns").select("*").eq("id", campaignId).maybeSingle();

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
    const { count: existingCount } = await admin
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);

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
      // prevents concurrent-run duplicates.
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
            throw new Error(`recipients insert failed: ${insErr.message}`);
          }
        }
      }

      // total_recipients = actual persisted rows, not resolver payload length
      const { count: actualCount } = await admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);
      await admin.from("email_campaigns").update({
        total_recipients: actualCount || 0,
      }).eq("id", campaignId);
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

    const { data: pending } = await pendingQuery;
    const pendingCount = pending?.length || 0;
    if (pendingCount === 0) {
      await admin.from("email_campaigns").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", campaignId);
      return json({ ok: true, message: "Нет получателей в очереди" }, 200);
    }

    // Quota
    const scopeKey = campaign.scope === "platform" ? "platform" : campaign.organization_id;
    const { data: quota, error: qErr } = await admin.rpc("consume_email_quota", {
      p_scope_key: scopeKey,
      p_count: pendingCount,
    });
    if (qErr) {
      return json({ error: "Ошибка квоты: " + qErr.message }, 500);
    }
    if (quota && (quota as any).allowed === false) {
      return json({
        ok: false, quotaExceeded: true, ...(quota as any),
        message: `Лимит на сегодня: ${(quota as any).daily_limit}, отправлено: ${(quota as any).sent_today}, доступно: ${(quota as any).remaining}. Запрошено: ${pendingCount}.`,
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

      const { data: leftovers } = await admin.from("email_campaign_recipients")
        .select("id").eq("campaign_id", campaignId).eq("status", "pending");
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
