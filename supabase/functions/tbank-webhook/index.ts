import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

async function recordBalanceTransaction(
  supabaseAdmin: ReturnType<typeof createClient>,
  organizationId: string,
  amount: number,
  type: string,
  description: string,
  relatedOrderId?: string,
) {
  // Insert balance transaction
  await supabaseAdmin.from("balance_transactions").insert({
    organization_id: organizationId,
    amount,
    type,
    description,
    related_order_id: relatedOrderId || null,
    performed_by: null,
  });

  // Update organization balance by summing all transactions
  const { data: txSum } = await supabaseAdmin
    .from("balance_transactions")
    .select("amount")
    .eq("organization_id", organizationId);

  const newBalance = (txSum || []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

  await supabaseAdmin
    .from("organizations")
    .update({ balance: newBalance })
    .eq("id", organizationId);

  console.log("Balance transaction recorded:", { organizationId, amount, type, newBalance });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    
    const {
      TerminalKey,
      OrderId,
      Success,
      Status,
      PaymentId,
      Amount,
      Token: receivedToken,
    } = body;

    if (!TerminalKey || !OrderId || !receivedToken) {
      console.error("Missing required params:", { TerminalKey, OrderId });
      return new Response("OK", { status: 200 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Determine if this is a subscription payment (OrderId starts with "sub_")
    const isSubscription = OrderId.startsWith("sub_");
    const realId = isSubscription ? OrderId.replace("sub_", "") : OrderId;

    let password: string;

    if (isSubscription) {
      // Try to find invoice by payment_id first (most reliable), then by truncated id
      let invoice: any = null;
      
      if (PaymentId) {
        const { data } = await supabaseAdmin
          .from("subscription_invoices")
          .select("id, organization_id, plan, period_months")
          .eq("payment_id", String(PaymentId))
          .single();
        invoice = data;
      }
      
      if (!invoice) {
        // Fallback: try matching by id prefix (realId is truncated UUID without dashes)
        const { data: allInvoices } = await supabaseAdmin
          .from("subscription_invoices")
          .select("id, organization_id, plan, period_months")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(50);
        
        invoice = (allInvoices || []).find((inv: any) => 
          inv.id.replace(/-/g, "").startsWith(realId)
        );
      }

      if (!invoice) {
        console.error("Subscription invoice not found:", realId, "PaymentId:", PaymentId);
        return new Response("OK", { status: 200 });
      }

      // Get payment settings for verification
      const { data: settings } = await supabaseAdmin
        .rpc("get_decrypted_payment_settings", { p_organization_id: (invoice as any).organization_id });

      if (settings && settings.length > 0 && settings[0].password) {
        password = settings[0].password;
      } else {
        const { data: appSettings } = await supabaseAdmin
          .from("app_settings")
          .select("setting_key, setting_value")
          .in("setting_key", ["tbank_password"]);
        const pwRow = (appSettings || []).find((s: any) => s.setting_key === "tbank_password");
        password = pwRow?.setting_value || "";
      }

      // Verify token
      const verifyParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(body)) {
        if (key === "Token" || typeof value === "object") continue;
        verifyParams[key] = String(value);
      }
      const expectedToken = await generateToken(verifyParams, password);
      if (receivedToken.toLowerCase() !== expectedToken.toLowerCase()) {
        console.error("Token mismatch (subscription):", { received: receivedToken, expected: expectedToken });
        return new Response("OK", { status: 200 });
      }

      // Process subscription payment
      if (Status === "CONFIRMED" || Status === "AUTHORIZED") {
        const now = new Date();
        const paidUntil = new Date(now);
        paidUntil.setMonth(paidUntil.getMonth() + ((invoice as any).period_months || 1));

        // Update invoice
        await supabaseAdmin
          .from("subscription_invoices")
          .update({
            status: "paid",
            paid_at: now.toISOString(),
            payment_id: String(PaymentId),
          } as any)
          .eq("id", realId);

        // Update organization plan
        await supabaseAdmin
          .from("organizations")
          .update({
            subscription_plan: (invoice as any).plan,
            paid_until: paidUntil.toISOString(),
          })
          .eq("id", (invoice as any).organization_id);

        // Record balance transaction for subscription
        const amountRub = Number(Amount) / 100;
        await recordBalanceTransaction(
          supabaseAdmin,
          (invoice as any).organization_id,
          amountRub,
          "subscription",
          `Оплата подписки "${(invoice as any).plan}" на ${(invoice as any).period_months} мес.`,
        );

        console.log("Subscription activated:", { org: (invoice as any).organization_id, plan: (invoice as any).plan, until: paidUntil.toISOString() });
      } else if (Status === "REJECTED" || Status === "CANCELED") {
        await supabaseAdmin
          .from("subscription_invoices")
          .update({ status: "failed" } as any)
          .eq("id", realId);
      }

      return new Response("OK", { status: 200 });
    }

    // --- Course payment logic ---
    const { data: payment } = await supabaseAdmin
      .from("course_payments")
      .select("id, organization_id, course_id, user_id")
      .eq("id", OrderId)
      .single();

    if (!payment) {
      console.error("Payment not found:", OrderId);
      return new Response("OK", { status: 200 });
    }

    const { data: settings } = await supabaseAdmin
      .rpc("get_decrypted_payment_settings", { p_organization_id: payment.organization_id });

    if (!settings || settings.length === 0) {
      console.error("No payment settings for org:", payment.organization_id);
      return new Response("OK", { status: 200 });
    }

    password = settings[0].password;

    const verifyParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === "Token" || typeof value === "object") continue;
      verifyParams[key] = String(value);
    }

    const expectedToken = await generateToken(verifyParams, password);

    if (receivedToken.toLowerCase() !== expectedToken.toLowerCase()) {
      console.error("Token mismatch:", {
        received: receivedToken,
        expected: expectedToken,
      });
      return new Response("OK", { status: 200 });
    }

    if (Status === "CONFIRMED" || Status === "AUTHORIZED") {
      await supabaseAdmin
        .from("course_payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          robokassa_inv_id: PaymentId,
        })
        .eq("id", OrderId);

      if (payment.user_id && payment.course_id) {
        const { data: existing } = await supabaseAdmin
          .from("enrollments")
          .select("id")
          .eq("user_id", payment.user_id)
          .eq("course_id", payment.course_id)
          .maybeSingle();

        if (!existing) {
          await supabaseAdmin
            .from("enrollments")
            .insert({
              user_id: payment.user_id,
              course_id: payment.course_id,
              status: "active",
              progress: 0,
            });
        }
      }

      // Record balance transaction for course payment
      const amountRub = Number(Amount) / 100;
      // Get course title for description
      let courseTitle = "Курс";
      if (payment.course_id) {
        const { data: course } = await supabaseAdmin
          .from("courses")
          .select("title")
          .eq("id", payment.course_id)
          .single();
        if (course) courseTitle = course.title;
      }

      await recordBalanceTransaction(
        supabaseAdmin,
        payment.organization_id,
        amountRub,
        "payment",
        `Оплата курса "${courseTitle}"`,
        OrderId,
      );
    } else if (Status === "REJECTED" || Status === "CANCELED") {
      await supabaseAdmin
        .from("course_payments")
        .update({ status: "failed" })
        .eq("id", OrderId);
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("tbank-webhook error:", err);
    return new Response("OK", { status: 200 });
  }
});
