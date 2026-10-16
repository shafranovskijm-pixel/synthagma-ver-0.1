import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPaidSubscriptionPlan, subscriptionMonthlyAmount } from "../_shared/subscription-pricing.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    if (req.headers.get("authorization") !== `Bearer ${supabaseKey}`) {
      const schedulerSecret = req.headers.get("x-billing-cron-secret");
      if (!schedulerSecret || schedulerSecret.length !== 64) {
        return new Response(JSON.stringify({ error: "Scheduled service authorization required" }), { status: 401 });
      }
      const { data: valid, error: authError } = await supabase.rpc("verify_billing_cron_secret", { p_secret: schedulerSecret });
      if (authError || valid !== true) {
        return new Response(JSON.stringify({ error: "Scheduled service authorization required" }), { status: authError ? 503 : 401 });
      }
    }

    // Closed months create internal review drafts only. The SQL RPC is
    // idempotent and cannot issue an invoice, charge or grant access.
    const { data: postpaid, error: postpaidError } = await supabase.rpc("prepare_due_postpaid_statements");
    if (postpaidError) throw postpaidError;
    if (postpaid?.failed > 0) throw new Error("Some postpaid draft periods require administrator investigation");

    // Find orgs with paid_until in ~7 days
    const now = new Date();
    const in6 = new Date(now);
    in6.setDate(in6.getDate() + 6);
    const in8 = new Date(now);
    in8.setDate(in8.getDate() + 8);

    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, subscription_plan, paid_until, custom_price, custom_discount")
      .not("paid_until", "is", null)
      .gte("paid_until", in6.toISOString().split("T")[0])
      .lte("paid_until", in8.toISOString().split("T")[0])
      .neq("subscription_plan", "free");

    if (orgErr) throw orgErr;
    if (!orgs || orgs.length === 0) {
      return new Response(JSON.stringify({ message: "No expiring prepaid subscriptions", postpaid }), { status: 200 });
    }

    let processed = 0;

    for (const org of orgs) {
      const { data: hasPostpaid, error: agreementError } = await supabase.rpc("has_active_postpaid_agreement", { p_organization_id: org.id });
      if (agreementError) throw agreementError; // Unknown is not permission to invoice.
      if (hasPostpaid || !isPaidSubscriptionPlan(org.subscription_plan)) continue;
      // Check if notification already sent in last 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: existing } = await supabase
        .from("org_notifications")
        .select("id")
        .eq("organization_id", org.id)
        .eq("type", "subscription_expiry")
        .gte("created_at", weekAgo.toISOString())
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Generate invoice number
      const year = now.getFullYear();
      const { count } = await supabase
        .from("subscription_invoices")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id);

      const invoiceNum = `СЧ-${year}/${String((count || 0) + 1).padStart(4, "0")}`;

      const amount = subscriptionMonthlyAmount(org.subscription_plan, org.custom_price, org.custom_discount);

      // Create invoice
      const { data: invoice, error: invErr } = await supabase
        .from("subscription_invoices")
        .insert({
          organization_id: org.id,
          invoice_number: invoiceNum,
          plan: org.subscription_plan,
          amount,
          period_months: 1,
        })
        .select("id")
        .single();

      if (invErr) {
        console.error(`Invoice error for ${org.id}:`, invErr);
        continue;
      }

      // Create notification
      await supabase.from("org_notifications").insert({
        organization_id: org.id,
        type: "subscription_expiry",
        title: "Тариф истекает через 7 дней",
        message: `Ваш тариф «${org.subscription_plan}» истекает ${new Date(org.paid_until).toLocaleDateString("ru-RU")}. Мы подготовили счёт на продление — нажмите, чтобы просмотреть.`,
        related_id: invoice.id,
        is_read: false,
      });

      processed++;
    }

    return new Response(JSON.stringify({ message: `Processed ${processed} prepaid orgs`, postpaid }), { status: 200 });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
