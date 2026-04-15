import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const monthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // Get all active partners
    const { data: partners } = await supabase
      .from("referral_partners")
      .select("id, referred_by_partner_id")
      .eq("status", "active");

    if (!partners || partners.length === 0) {
      return new Response(JSON.stringify({ message: "No active partners" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all commissions for this month
    const { data: allCommissions } = await supabase
      .from("referral_commissions")
      .select("partner_id, commission_amount, level, bonus_type")
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd);

    const commissions = allCommissions || [];

    // Build network revenue map (sum all commissions from partner's downline)
    // For each partner, network_revenue = sum of all base commissions (not bonuses) from their direct registrations
    // + all commissions from level 2 and 3 partners
    const partnerStats = new Map<string, { directRevenue: number; networkRevenue: number; totalCommission: number }>();

    for (const p of partners) {
      const myCommissions = commissions.filter(c => c.partner_id === p.id);
      const directRevenue = myCommissions
        .filter(c => c.level === 1 && !c.bonus_type)
        .reduce((sum, c) => sum + Number(c.commission_amount), 0);
      const totalCommission = myCommissions
        .reduce((sum, c) => sum + Number(c.commission_amount), 0);

      // Network revenue = total payment amounts that went through this partner's network
      // We approximate by summing all commissions (base) at all levels
      const networkRevenue = myCommissions
        .filter(c => !c.bonus_type)
        .reduce((sum, c) => sum + Number(c.commission_amount), 0);

      partnerStats.set(p.id, { directRevenue, networkRevenue, totalCommission });
    }

    // Sort by networkRevenue to determine top-10
    const sorted = [...partnerStats.entries()]
      .sort((a, b) => b[1].networkRevenue - a[1].networkRevenue);

    const top10Ids = new Set(sorted.slice(0, 10).filter(([, s]) => s.networkRevenue > 0).map(([id]) => id));

    // Reset all partner flags
    await supabase
      .from("referral_partners")
      .update({ has_turnover_bonus: false, is_top_partner: false, monthly_network_revenue: 0 })
      .eq("status", "active");

    // Update each partner
    for (const [partnerId, stats] of partnerStats) {
      const hasTurnover = stats.networkRevenue > 100000;
      const isTop = top10Ids.has(partnerId);

      await supabase
        .from("referral_partners")
        .update({
          monthly_network_revenue: stats.networkRevenue,
          has_turnover_bonus: hasTurnover,
          is_top_partner: isTop,
        })
        .eq("id", partnerId);

      // Upsert monthly stats
      const rank = sorted.findIndex(([id]) => id === partnerId) + 1;

      await supabase
        .from("partner_monthly_stats")
        .upsert({
          partner_id: partnerId,
          month: monthDate,
          network_revenue: stats.networkRevenue,
          direct_revenue: stats.directRevenue,
          total_commission: stats.totalCommission,
          rank: rank || null,
          is_top: isTop,
        }, { onConflict: "partner_id,month" });
    }

    return new Response(
      JSON.stringify({ success: true, partners_processed: partners.length, top10: [...top10Ids] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
