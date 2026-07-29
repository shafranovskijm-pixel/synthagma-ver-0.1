// =====================================================================
// PENDING — Phase 5C.1.a. Do not deploy until the accompanying RLS
// migration is planned. This file lives OUTSIDE supabase/functions/ so
// Lovable does not auto-deploy it.
//
// Delta vs current supabase/functions/run-email-campaign/index.ts:
//   • Auth check happens BEFORE any recipient read or campaign mutation.
//   • Uses shared authorizeCampaignAction() — see src/lib/campaignAuthz.ts
//     (logic duplicated inline because Deno cannot import from src/).
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

const SEND_DELAY_MS = 1500;
const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

interface ReqBody { campaignId: string }

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

    // Body first — need campaignId to know which org we're authorizing against.
    const { campaignId }: ReqBody = await req.json().catch(() => ({ campaignId: "" }));
    if (!campaignId) {
      return json({ error: "campaignId required" }, 400);
    }

    // Load campaign via admin so we can authorize; details are NOT returned on denial.
    const { data: campaign, error: cErr } = await admin
      .from("email_campaigns")
      .select("id, scope, organization_id, status, started_at, ab_test_enabled, subject_b, subject, ab_sample_percent, ab_sample_started_at, ab_winner, recipient_source, organization_id, manual_emails, total_recipients")
      .eq("id", campaignId)
      .maybeSingle();

    // Auth branch
    let userId: string | null = null;
    let isAdmin = false;
    let hasSalesWrite = false;

    if (!isServiceRole) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      userId = userData.user.id;

      // has_role(admin, user)
      const { data: adminRow } = await admin.rpc("has_role", {
        _role: "admin", _user_id: userId,
      });
      isAdmin = adminRow === true;

      if (campaign?.scope === "org" && campaign.organization_id) {
        const { data: writeRow } = await admin.rpc("can_access_organization", {
          _organization_id: campaign.organization_id,
          _permission: "sales.write",
        });
        hasSalesWrite = writeRow === true;
      }
    }

    // Uniform 403 whether the campaign exists or belongs to a different org.
    // This is intentional: a foreign UUID must not leak campaign existence.
    const authorized = (() => {
      if (isServiceRole) return true;
      if (!campaign) return false;
      if (campaign.scope === "platform") return isAdmin;
      if (campaign.scope === "org") return isAdmin || hasSalesWrite;
      return false;
    })();

    if (!authorized) return json({ error: "Forbidden" }, 403);
    if (!campaign) return json({ error: "Кампания не найдена" }, 404);

    // ==============================================================
    // From here on, behaviour is identical to the current function.
    // Refer to supabase/functions/run-email-campaign/index.ts.
    // Duplicated verbatim so the pending file is drop-in.
    // ==============================================================

    if (campaign.status === "sending" && campaign.started_at) {
      const startedMs = new Date(campaign.started_at as string).getTime();
      if (Date.now() - startedMs < 5 * 60 * 1000) {
        return json({ ok: true, alreadyRunning: true }, 200);
      }
    }

    const { count: existingCount } = await admin
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);

    if ((existingCount || 0) === 0) {
      const all = await resolveRecipients(admin, campaign);
      const seen = new Set<string>();
      const unique = all.filter((r) => !seen.has(r.email) && (seen.add(r.email), true));
      const scopeKey0 = campaign.scope === "platform"
        ? "platform"
        : (campaign.organization_id || "platform");
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
      if (allowed.length > 0) {
        const rows = allowed.map((r) => ({
          campaign_id: campaignId,
          email: r.email,
          recipient_name: r.name,
          status: "pending" as const,
        }));
        for (let i = 0; i < rows.length; i += 500) {
          await admin.from("email_campaign_recipients").insert(rows.slice(i, i + 500));
        }
      }
      await admin.from("email_campaigns").update({ total_recipients: allowed.length }).eq("id", campaignId);
    }

    const { data: pending } = await admin
      .from("email_campaign_recipients")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("status", "pending");

    const pendingCount = pending?.length || 0;
    if (pendingCount === 0) {
      await admin.from("email_campaigns").update({
        status: "completed", completed_at: new Date().toISOString(),
      }).eq("id", campaignId);
      return json({ ok: true, message: "Нет получателей в очереди" }, 200);
    }

    const scopeKey = campaign.scope === "platform" ? "platform" : campaign.organization_id;
    const { data: quota, error: qErr } = await admin.rpc("consume_email_quota", {
      p_scope_key: scopeKey, p_count: pendingCount,
    });
    if (qErr) return json({ error: "Ошибка квоты: " + qErr.message }, 500);
    if (quota && (quota as any).allowed === false) {
      return json({ ok: false, quotaExceeded: true, ...(quota as any) }, 200);
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
        } catch (e) { console.error("send-campaign-email invoke failed", e); }
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
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(runner);

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

async function resolveRecipients(admin: ReturnType<typeof createClient>, campaign: any) {
  const src = campaign.recipient_source as string;
  const orgId = campaign.organization_id as string | null;
  const toRow = (r: any, nameKey = "full_name") => ({
    email: String(r.email).trim().toLowerCase(),
    name: r[nameKey] || r.name || "",
  });
  const validate = (rows: any[]) => rows.filter((r) => isValidEmail(r.email));
  if (src === "manual") {
    const emails: string[] = Array.isArray(campaign.manual_emails) ? campaign.manual_emails : [];
    return validate(emails.map((e) => ({ email: String(e).trim().toLowerCase(), name: "" })));
  }
  if (src === "organizations") {
    const { data } = await admin.from("organizations").select("name, email").not("email", "is", null);
    return validate((data || []).map((r: any) => toRow(r, "name")));
  }
  if (src === "companies_db") {
    const { data } = await admin.from("sales_companies_db" as any).select("name, email").not("email", "is", null);
    return validate((data || []).map((r: any) => toRow(r, "name")));
  }
  if (!orgId) return [];
  if (src === "students") {
    const { data } = await admin.from("profiles").select("full_name, email")
      .eq("organization_id", orgId).not("email", "is", null);
    return validate((data || []).map((r: any) => toRow(r)));
  }
  if (src === "companies") {
    const { data } = await admin.from("companies").select("name, email")
      .eq("organization_id", orgId).not("email", "is", null);
    return validate((data || []).map((r: any) => toRow(r, "name")));
  }
  return [];
}
