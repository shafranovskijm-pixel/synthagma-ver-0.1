import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateToken(params: Record<string, string>, password: string): Promise<string> {
  const allParams = { ...params, Password: password };
  const sorted = Object.keys(allParams).sort();
  const concatenated = sorted.map(k => allParams[k]).join("");
  const encoder = new TextEncoder();
  const data = encoder.encode(concatenated);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

const PLAN_PRICES: Record<string, number> = {
  start: 3490,
  standard: 6990,
  professional: 16990,
  maximum: 24990,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { organization_id, plan, period_months, email } = await req.json();

    if (!organization_id || !plan) {
      return new Response(JSON.stringify({ error: "organization_id and plan are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const monthlyPrice = PLAN_PRICES[plan];
    if (!monthlyPrice) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const months = period_months === 12 ? 12 : 1;
    const discount = months === 12 ? 0.15 : 0;
    const totalAmount = Math.round(monthlyPrice * months * (1 - discount));

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get platform payment settings (use org's own settings or a platform-level one)
    // For subscription payments we use the organization's payment settings
    const { data: settings } = await supabaseAdmin
      .rpc("get_decrypted_payment_settings", { p_organization_id: organization_id });

    // If org has no payment settings, try platform-level settings
    let terminalKey: string;
    let password: string;
    let isTestMode = false;

    if (settings && settings.length > 0 && settings[0].terminal_key) {
      terminalKey = settings[0].terminal_key;
      password = settings[0].password;
      isTestMode = settings[0].is_test_mode;
    } else {
      // Try fetching from app_settings for platform-level T-Bank credentials
      const { data: appSettings } = await supabaseAdmin
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["tbank_terminal_key", "tbank_password", "tbank_test_mode"]);

      const settingsMap: Record<string, string> = {};
      (appSettings || []).forEach((s: any) => { settingsMap[s.setting_key] = s.setting_value; });

      if (!settingsMap.tbank_terminal_key) {
        return new Response(JSON.stringify({ error: "Payment not configured" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      terminalKey = settingsMap.tbank_terminal_key;
      password = settingsMap.tbank_password || "";
      isTestMode = settingsMap.tbank_test_mode === "true";
    }

    // Create invoice record
    const year = new Date().getFullYear();
    const { count } = await supabaseAdmin
      .from("subscription_invoices")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organization_id);

    const invoiceNum = `ОПЛ-${year}/${String((count || 0) + 1).padStart(4, "0")}`;

    const planNames: Record<string, string> = {
      start: "Старт",
      standard: "Стандарт",
      professional: "Профессиональный",
      maximum: "Максимальный",
    };

    const { data: invoice, error: invErr } = await supabaseAdmin
      .from("subscription_invoices")
      .insert({
        organization_id,
        invoice_number: invoiceNum,
        plan,
        amount: totalAmount,
        period_months: months,
        status: "pending",
        payment_method: "tbank",
      } as any)
      .select("id")
      .single();

    if (invErr || !invoice) {
      console.error("Invoice insert error:", invErr);
      return new Response(JSON.stringify({ error: "Failed to create invoice" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountInKopecks = totalAmount * 100;
    const siteUrl = "https://sintagma.com.ru";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const notificationUrl = `${supabaseUrl}/functions/v1/tbank-webhook`;

    const orderId = `sub_${(invoice as any).id}`;

    const description = `Подписка «${planNames[plan] || plan}» — ${months} мес.`.substring(0, 250);

    const initParams: Record<string, string> = {
      TerminalKey: terminalKey,
      Amount: String(amountInKopecks),
      OrderId: orderId,
      Description: description,
      SuccessURL: `${siteUrl}/payment-success?type=subscription`,
      FailURL: `${siteUrl}/payment-fail?type=subscription`,
      NotificationURL: notificationUrl,
    };

    const token = await generateToken(initParams, password);

    const requestBody: Record<string, any> = {
      ...initParams,
      Token: token,
    };

    if (email) {
      requestBody.Receipt = {
        Email: email,
        Taxation: "usn_income",
        Items: [{
          Name: description.substring(0, 128),
          Price: amountInKopecks,
          Quantity: 1,
          Amount: amountInKopecks,
          Tax: "none",
          PaymentMethod: "full_payment",
          PaymentObject: "service",
        }],
      };
    }

    const apiUrl = isTestMode
      ? "https://rest-api-test.tinkoff.ru/v2/Init"
      : "https://securepay.tinkoff.ru/v2/Init";

    console.log("T-Bank Init request to:", apiUrl, "TerminalKey:", terminalKey);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("T-Bank response status:", response.status, "body preview:", responseText.substring(0, 300));

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("T-Bank returned non-JSON:", responseText.substring(0, 500));
      return new Response(JSON.stringify({ error: "T-Bank returned invalid response", details: responseText.substring(0, 200) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!result.Success) {
      console.error("T-Bank Init error:", result);
      return new Response(JSON.stringify({ error: result.Message || "Payment init failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save T-Bank PaymentId
    await supabaseAdmin
      .from("subscription_invoices")
      .update({ payment_id: result.PaymentId } as any)
      .eq("id", (invoice as any).id);

    return new Response(JSON.stringify({
      url: result.PaymentURL,
      invoice_id: (invoice as any).id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("tbank-init-subscription error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
