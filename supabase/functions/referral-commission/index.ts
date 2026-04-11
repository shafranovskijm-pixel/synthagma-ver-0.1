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
    const { organization_id, amount, payment_source } = await req.json();

    if (!organization_id || !amount) {
      return new Response(JSON.stringify({ error: "Missing organization_id or amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find active referral registration for this org
    const { data: reg } = await supabase
      .from("referral_registrations")
      .select("partner_id, expires_at, referral_partners(id, commission_percent, balance, total_earned, status)")
      .eq("organization_id", organization_id)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!reg || !reg.referral_partners) {
      return new Response(JSON.stringify({ message: "No active referral partner for this org" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const partner = reg.referral_partners as any;
    if (partner.status !== "active") {
      return new Response(JSON.stringify({ message: "Partner is not active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const commissionAmount = Math.round(amount * (partner.commission_percent / 100) * 100) / 100;

    // Create commission record
    await supabase.from("referral_commissions").insert({
      partner_id: partner.id,
      organization_id,
      payment_source: payment_source || "subscription",
      amount,
      commission_amount: commissionAmount,
      status: "pending",
    });

    // Update partner balance and total_earned
    await supabase
      .from("referral_partners")
      .update({
        balance: Number(partner.balance) + commissionAmount,
        total_earned: Number(partner.total_earned) + commissionAmount,
      })
      .eq("id", partner.id);

    return new Response(
      JSON.stringify({ success: true, commission: commissionAmount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
