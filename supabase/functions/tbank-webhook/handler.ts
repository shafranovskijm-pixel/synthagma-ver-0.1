import { constantTimeTokenEqual, generateTbankToken, resolveTbankCredentials } from "../_shared/tbank-payment.ts";

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const ok = () => new Response("OK", { status: 200 });

export function createTbankWebhookHandler(db: any, log: Pick<Console, "error" | "warn"> = console) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    let body: any;
    try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (!body || Array.isArray(body) || typeof body.OrderId !== "string" || typeof body.TerminalKey !== "string"
      || typeof body.Token !== "string" || typeof body.Status !== "string"
      || !/^[0-9]{1,30}$/.test(String(body.PaymentId ?? ""))
      || !Number.isSafeInteger(Number(body.Amount)) || Number(body.Amount) <= 0) {
      return new Response("Invalid notification", { status: 400 });
    }
    const subscription = /^sub_[a-f\d]{28}$/i.test(body.OrderId);
    if (!subscription && !uuid.test(body.OrderId)) return new Response("Invalid order", { status: 400 });

    try {
      // Order identity is persisted before contacting the bank. No newest-50
      // scan, prefix guess, or unbound PaymentId lookup is used.
      const query = subscription
        ? db.from("subscription_invoices").select("id, organization_id, amount, payment_id, payment_method, tbank_terminal_key").eq("tbank_order_id", body.OrderId)
        : db.from("course_payments").select("id, organization_id, amount, robokassa_inv_id, payment_method, tbank_terminal_key").eq("id", body.OrderId);
      const { data: payment, error } = await query.maybeSingle();
      if (error) throw new Error("Payment lookup unavailable");
      if (!payment) throw new Error("Payment order is not yet available");
      if (payment.payment_method !== "tbank") return new Response("Payment method mismatch", { status: 400 });
      const paymentId = subscription ? payment.payment_id : payment.robokassa_inv_id;
      if (paymentId != null && String(paymentId) !== String(body.PaymentId)) return new Response("Payment identity mismatch", { status: 400 });
      const settings = await resolveTbankCredentials(db, payment.organization_id, subscription, payment.tbank_terminal_key ?? body.TerminalKey);
      if (settings.terminalKey !== body.TerminalKey) return new Response("Terminal mismatch", { status: 400 });
      const expected = await generateTbankToken(body, settings.password);
      if (!constantTimeTokenEqual(body.Token, expected)) return new Response("Invalid token", { status: 403 });
      if (Math.round(Number(payment.amount) * 100) !== Number(body.Amount)) return new Response("Payment amount mismatch", { status: 400 });

      // AUTHORIZED is a hold. The one-stage gateway sends both AUTHORIZED and
      // CONFIRMED; only a captured payment grants access.
      if (!["CONFIRMED", "REJECTED", "CANCELED"].includes(body.Status)) return ok();
      if (body.Status === "CONFIRMED" && body.Success !== true) return new Response("Unsuccessful confirmation", { status: 400 });
      const { data: applied, error: applyError } = await db.rpc("apply_tbank_payment_event", {
        p_kind: subscription ? "subscription" : "course",
        p_record_id: payment.id, p_payment_id: String(body.PaymentId),
        p_terminal_key: settings.terminalKey, p_amount_kopecks: Number(body.Amount), p_status: body.Status,
      });
      if (applyError || !applied || typeof applied.applied !== "boolean" || typeof applied.outcome !== "string") {
        throw new Error("Atomic payment settlement failed");
      }
      if (applied.requires_review) log.warn("T-Bank payment needs reconciliation", { recordId: payment.id });
      return ok();
    } catch {
      // Unknown/partial results must be retried. Never log tokens or payloads.
      log.error("T-Bank notification could not be settled");
      return new Response("Internal error", { status: 500 });
    }
  };
}
