// =====================================================================
// PENDING — Phase 5C.1.a (corrected in 5C.1.a.1). Do NOT deploy until
// the accompanying RLS migration is planned. This file lives OUTSIDE
// supabase/functions/ so Lovable does not auto-deploy it.
//
// 5C.1.a.1 corrections vs 5C.1.a draft:
//   • can_access_organization is now invoked via the USER client
//     (carries the caller's JWT). The service-role client has no
//     auth.uid() and would always return false, so owners and
//     sales.write staff were being denied.
//   • has_role is also invoked via the user client with the resolved
//     userId — we never trust a userId supplied by the body.
//   • The FULL current pipeline (A/B sample assignment, sampleSize,
//     subject_variant filter, ab_sample_started_at, ab_winner gating)
//     is preserved verbatim after the authorization gate. Only the
//     top-of-function auth check is new; downstream behaviour is
//     unchanged.
//   • The service-role client is only used AFTER the authorization
//     gate succeeds, to read/mutate campaign rows, recipients and
//     suppression list.
//
// Delta vs current supabase/functions/run-email-campaign/index.ts:
//   • Auth check happens BEFORE any recipient read or campaign mutation.
//   • Denials return 403 with no campaign name / recipients / totals.
//   • Platform campaigns require admin (or service_role for cron).
//   • Org campaigns require admin OR can_access_organization(org, 'sales.write').
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody { campaignId: string; }

const SEND_DELAY_MS = 1500;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function resolveRecipients(
  admin: ReturnType<typeof createClient>,
  campaign: any,
): Promise<Array<{ email: string; name: string }>> {
  const source: string = campaign.recipient_source;
  const orgId: string | null = campaign.organization_id;

  if (source === "manual") {
    const emails: string[] = Array.isArray(campaign.manual_emails) ? campaign.manual_emails : [];
    return emails
      .map((e) => String(e).trim().toLowerCase())
      .filter(isValidEmail)
      .map((email) => ({ email, name: "" }));
  }

  if (source === "organizations") {
    const { data } = await admin.from("organizations").select("name, email").not("email", "is", null);
    return (data || [])
      .filter((r: any) => isValidEmail(r.email))
      .map((r: any) => ({ email: String(r.email).trim().toLowerCase(), name: r.name || "" }));
  }

  if (source === "companies_db") {
    const { data } = await admin.from("sales_companies_db" as any).select("name, email").not("email", "is", null);
    return (data || [])
      .filter((r: any) => isValidEmail(r.email))
      .map((r: any) => ({ email: String(r.email).trim().toLowerCase(), name: r.name || "" }));
  }

  if (!orgId) return [];

  if (source === "students") {
    const { data } = await admin.from("profiles")
      .select("full_name, email")
      .eq("organization_id", orgId)
      .not("email", "is", null);
    return (data || [])
      .filter((r: any) => isValidEmail(r.email))
      .map((r: any) => ({ email: String(r.email).trim().toLowerCase(), name: r.full_name || "" }));
  }

  if (source === "companies") {
    const { data } = await admin.from("companies")
      .select("name, email")
      .eq("organization_id", orgId)
      .not("email", "is", null);
    return (data || [])
      .filter((r: any) => isValidEmail(r.email))
      .map((r: any) => ({ email: String(r.email).trim().toLowerCase(), name: r.name || "" }));
  }

  return [];
}

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

    // ============ AUTHORIZATION GATE (new in 5C.1.a) ============
    // Load campaign via admin so scope/org is known; details are NOT
    // returned to the caller on denial.
    const { data: campaign, error: cErr } = await admin
      .from("email_campaigns").select("*").eq("id", campaignId).maybeSingle();

    let authorized = false;
    if (isServiceRole) {
      authorized = true;
    } else {
      // User client carries the caller's JWT — required for
      // can_access_organization / has_role, both of which read auth.uid().
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
        // Uniform 403: don't leak whether the UUID exists in another org.
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
    // ============ END AUTHORIZATION GATE ============

    // ==============================================================
    // From here on, behaviour is IDENTICAL to the current function
    // supabase/functions/run-email-campaign/index.ts. Any change to
    // that file must be mirrored here until this pending file is
    // promoted.
    // ==============================================================

    // Идемпотентность
    if (campaign.status === "sending" && campaign.started_at) {
      const startedMs = new Date(campaign.started_at).getTime();
      if (Date.now() - startedMs < 5 * 60 * 1000) {
        return new Response(JSON.stringify({
          ok: true, alreadyRunning: true,
          message: "Кампания уже отправляется (идёт фоновая обработка)",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ============ Заполнение получателей (если ещё не было) ============
    const { count: existingCount } = await admin
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);

    if ((existingCount || 0) === 0) {
      const all = await resolveRecipients(admin, campaign);

      // Дедупликация по email
      const seen = new Set<string>();
      const unique = all.filter((r) => {
        if (seen.has(r.email)) return false;
        seen.add(r.email);
        return true;
      });

      // Фильтр по suppression-листу
      const scopeKey0 = campaign.scope === "platform" ? "platform" : (campaign.organization_id || "platform");
      let allowed = unique;
      if (unique.length > 0) {
        const emails = unique.map((r) => r.email);
        const { data: suppRows } = await admin
          .from("email_suppressions")
          .select("email")
          .in("email", emails)
          .in("scope", [scopeKey0, "platform"]);
        const suppSet = new Set((suppRows || []).map((r: any) => String(r.email).toLowerCase()));
        allowed = unique.filter((r) => !suppSet.has(r.email));
      }

      // ============ A/B-тест: размечаем sample получателей ============
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

      // Вставка партиями по 500
      if (allowed.length > 0) {
        const rows = allowed.map((r) => ({
          campaign_id: campaignId,
          email: r.email,
          recipient_name: r.name,
          status: "pending" as const,
          subject_variant: abAssign?.get(r.email) || null,
        }));
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const slice = rows.slice(i, i + BATCH);
          const { error: insErr } = await admin.from("email_campaign_recipients").insert(slice);
          if (insErr) console.error("recipients insert error", insErr);
        }
      }

      await admin.from("email_campaigns").update({
        total_recipients: allowed.length,
      }).eq("id", campaignId);
    }

    // ============ A/B-тест: на первом запуске отправляем только sample ============
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
      return new Response(JSON.stringify({ ok: true, message: "Нет получателей в очереди" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Проверяем квоту
    const scopeKey = campaign.scope === "platform" ? "platform" : campaign.organization_id;
    const { data: quota, error: qErr } = await admin.rpc("consume_email_quota", {
      p_scope_key: scopeKey,
      p_count: pendingCount,
    });
    if (qErr) {
      return new Response(JSON.stringify({ error: "Ошибка квоты: " + qErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (quota && (quota as any).allowed === false) {
      return new Response(JSON.stringify({
        ok: false, quotaExceeded: true, ...(quota as any),
        message: `Лимит на сегодня: ${(quota as any).daily_limit}, отправлено: ${(quota as any).sent_today}, доступно: ${(quota as any).remaining}. Запрошено: ${pendingCount}.`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Помечаем кампанию как sending
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

    return new Response(JSON.stringify({ ok: true, started: pendingCount, quota }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("run-email-campaign error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
