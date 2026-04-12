import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find orgs with paid_until in ~7 days
    const now = new Date();
    const in6 = new Date(now);
    in6.setDate(in6.getDate() + 6);
    const in8 = new Date(now);
    in8.setDate(in8.getDate() + 8);

    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, subscription_plan, paid_until")
      .not("paid_until", "is", null)
      .gte("paid_until", in6.toISOString().split("T")[0])
      .lte("paid_until", in8.toISOString().split("T")[0])
      .neq("subscription_plan", "free");

    if (orgErr) throw orgErr;
    if (!orgs || orgs.length === 0) {
      return new Response(JSON.stringify({ message: "No expiring subscriptions" }), { status: 200 });
    }

    let processed = 0;

    for (const org of orgs) {
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

      // Determine amount from plan
      const planPrices: Record<string, number> = {
        start: 1990,
        standard: 4990,
        professional: 9990,
        maximum: 19990,
      };
      const amount = planPrices[org.subscription_plan] || 1990;

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

    return new Response(JSON.stringify({ message: `Processed ${processed} orgs` }), { status: 200 });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
