import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { notifyStudent } from "../_shared/notification-prefs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { organization_id, amount, payment_source, invoice_id } = await req.json();

    if (!organization_id || !amount) {
      return new Response(JSON.stringify({ error: "Missing organization_id or amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Идемпотентность по invoice_id (если передан) — главный ключ.
    if (invoice_id) {
      const { data: existingByInvoice } = await supabase
        .from("referral_commissions")
        .select("id")
        .eq("invoice_id", invoice_id)
        .limit(1);
      if (existingByInvoice && existingByInvoice.length > 0) {
        return new Response(JSON.stringify({ message: "Already processed for this invoice", invoice_id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Fallback: дедуп за 60 секунд по org+source+amount
      const sinceIso = new Date(Date.now() - 60_000).toISOString();
      const { data: existing } = await supabase
        .from("referral_commissions")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("payment_source", payment_source || "subscription")
        .eq("amount", amount)
        .gte("created_at", sinceIso)
        .limit(1);
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ message: "Already processed (duplicate within 60s)" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    // Find active referral registration for this org
    const { data: reg } = await supabase
      .from("referral_registrations")
      .select("partner_id, expires_at")
      .eq("organization_id", organization_id)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!reg) {
      return new Response(JSON.stringify({ message: "No active referral for this org" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build partner chain (up to 3 levels)
    const partnerChain: any[] = [];
    let currentPartnerId = reg.partner_id;

    for (let level = 1; level <= 3 && currentPartnerId; level++) {
      const { data: partner } = await supabase
        .from("referral_partners")
        .select("id, user_id, status, level1_percent, level2_percent, level3_percent, balance, total_earned, referred_by_partner_id, monthly_network_revenue, has_turnover_bonus, is_top_partner")
        .eq("id", currentPartnerId)
        .maybeSingle();

      if (!partner || partner.status !== "active") break;

      const percent = level === 1 ? partner.level1_percent
        : level === 2 ? partner.level2_percent
        : partner.level3_percent;

      partnerChain.push({ ...partner, level, percent });
      currentPartnerId = partner.referred_by_partner_id;
    }

    if (partnerChain.length === 0) {
      return new Response(JSON.stringify({ message: "No active partners in chain" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const p of partnerChain) {
      // Base commission
      const baseCommission = Math.round(amount * (p.percent / 100) * 100) / 100;

      // Turnover bonus (+5%)
      const turnoverBonus = p.has_turnover_bonus
        ? Math.round(amount * 0.05 * 100) / 100
        : 0;

      // Leader bonus (+3%)
      const leaderBonus = p.is_top_partner
        ? Math.round(amount * 0.03 * 100) / 100
        : 0;

      const totalCommission = baseCommission + turnoverBonus + leaderBonus;

      // Insert base commission
      await supabase.from("referral_commissions").insert({
        partner_id: p.id,
        organization_id,
        payment_source: payment_source || "subscription",
        amount,
        commission_amount: baseCommission,
        status: "pending",
        level: p.level,
        source_partner_id: partnerChain[0].id,
        invoice_id: invoice_id || null,
        bonus_type: null,
      });

      // Insert turnover bonus if applicable
      if (turnoverBonus > 0) {
        await supabase.from("referral_commissions").insert({
          partner_id: p.id,
          organization_id,
          payment_source: payment_source || "subscription",
          amount,
          commission_amount: turnoverBonus,
          status: "pending",
          level: p.level,
          source_partner_id: partnerChain[0].id,
        invoice_id: invoice_id || null,
          bonus_type: "turnover",
        });
      }

      // Insert leader bonus if applicable
      if (leaderBonus > 0) {
        await supabase.from("referral_commissions").insert({
          partner_id: p.id,
          organization_id,
          payment_source: payment_source || "subscription",
          amount,
          commission_amount: leaderBonus,
          status: "pending",
          level: p.level,
          source_partner_id: partnerChain[0].id,
        invoice_id: invoice_id || null,
          bonus_type: "leader",
        });
      }

      // Update partner balance and total_earned
      await supabase
        .from("referral_partners")
        .update({
          balance: Number(p.balance) + totalCommission,
          total_earned: Number(p.total_earned) + totalCommission,
        })
        .eq("id", p.id);

      // Personal in-app notification for the partner (respects partner_changes.platform)
      if (p.user_id && totalCommission > 0) {
        await notifyStudent({
          userId: p.user_id,
          type: "partner_changes",
          title: `Начислено вознаграждение: ${totalCommission.toFixed(2)} ₽`,
          message: `Уровень ${p.level}. Источник — оплата организации.`,
          relatedId: null,
        });
      }

      results.push({
        partner_id: p.id,
        level: p.level,
        base: baseCommission,
        turnover_bonus: turnoverBonus,
        leader_bonus: leaderBonus,
        total: totalCommission,
      });
    }

    return new Response(
      JSON.stringify({ success: true, commissions: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
