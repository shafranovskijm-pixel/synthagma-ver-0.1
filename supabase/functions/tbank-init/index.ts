import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateToken(params: Record<string, string>, password: string): Promise<string> {
  // T-Bank token: add Password to params, sort by key, concatenate values, SHA-256
  const allParams = { ...params, Password: password };
  const sorted = Object.keys(allParams).sort();
  const concatenated = sorted.map(k => allParams[k]).join("");
  const encoder = new TextEncoder();
  const data = encoder.encode(concatenated);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { course_id, user_id, email } = await req.json();

    if (!course_id) {
      return new Response(JSON.stringify({ error: "course_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get course info
    const { data: course, error: courseErr } = await supabaseAdmin
      .from("courses")
      .select("id, title, price, organization_id")
      .eq("id", course_id)
      .single();

    if (courseErr || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!course.price || course.price <= 0) {
      return new Response(JSON.stringify({ error: "Course is free" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get payment settings
    const { data: settings } = await supabaseAdmin
      .rpc("get_decrypted_payment_settings", { p_organization_id: course.organization_id });

    if (!settings || settings.length === 0 || !settings[0].terminal_key) {
      return new Response(JSON.stringify({ error: "Payment not configured for this organization" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ps = settings[0];

    // Create payment record
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("course_payments")
      .insert({
        organization_id: course.organization_id,
        course_id: course.id,
        user_id: user_id || null,
        amount: course.price,
        status: "pending",
        email: email || null,
        payment_method: "tbank",
      })
      .select("id")
      .single();

    if (payErr || !payment) {
      console.error("Payment insert error:", payErr);
      return new Response(JSON.stringify({ error: "Failed to create payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Amount in kopecks
    const amountInKopecks = Math.round(course.price * 100);

    const siteUrl = "https://sintagma.com.ru";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const notificationUrl = `${supabaseUrl}/functions/v1/tbank-webhook`;

    // Build init params for T-Bank
    const initParams: Record<string, string> = {
      TerminalKey: ps.terminal_key,
      Amount: String(amountInKopecks),
      OrderId: payment.id,
      Description: `Оплата курса: ${course.title}`.substring(0, 250),
      SuccessURL: `${siteUrl}/payment-success`,
      FailURL: `${siteUrl}/payment-fail`,
      NotificationURL: notificationUrl,
    };

    // Generate token
    const token = await generateToken(initParams, ps.password);
    
    // Build request body
    const requestBody: Record<string, any> = {
      ...initParams,
      Token: token,
    };

    // Add receipt for 54-FZ compliance
    if (email) {
      requestBody.Receipt = {
        Email: email,
        Taxation: "usn_income",
        Items: [{
          Name: course.title.substring(0, 128),
          Price: amountInKopecks,
          Quantity: 1,
          Amount: amountInKopecks,
          Tax: "none",
          PaymentMethod: "full_payment",
          PaymentObject: "service",
        }],
      };
    }

    // Add DATA with user/course info for webhook
    requestBody.DATA = {};
    if (user_id) requestBody.DATA.user_id = user_id;
    requestBody.DATA.course_id = course_id;

    // Determine API URL based on test mode
    const apiUrl = ps.is_test_mode
      ? "https://rest-api-test.tinkoff.ru/v2/Init"
      : "https://securepay.tinkoff.ru/v2/Init";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();

    if (!result.Success) {
      console.error("T-Bank Init error:", result);
      return new Response(JSON.stringify({ error: result.Message || "Payment init failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save T-Bank PaymentId
    await supabaseAdmin
      .from("course_payments")
      .update({ robokassa_inv_id: result.PaymentId })
      .eq("id", payment.id);

    return new Response(JSON.stringify({ 
      url: result.PaymentURL, 
      payment_id: payment.id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("tbank-init error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
