import { isPaidSubscriptionPlan, subscriptionQuoteKopecks } from "../_shared/subscription-pricing.ts";
import { generateTbankToken, resolveTbankCredentials } from "../_shared/tbank-payment.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-connection-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
type Dependencies = {
  db: any;
  supabaseUrl: string;
  authorize: (authorization: string, organizationId: string) => Promise<boolean>;
  fetch: typeof fetch;
};
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const names = { start: "Старт", standard: "Стандарт", professional: "Профессиональный", maximum: "Максимальный" };
const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export function createSubscriptionCheckoutHandler({ db, supabaseUrl, authorize, fetch: request }: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "Используйте POST" }, 405);
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Требуется вход в систему" }, 401);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Некорректный запрос" }, 400); }
    if (!body || typeof body.organization_id !== "string" || !uuid.test(body.organization_id)
      || !isPaidSubscriptionPlan(body.plan) || ![undefined, 1, 12].includes(body.period_months)
      || (body.email != null && (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 255))) {
      return json({ error: "Некорректные параметры оплаты" }, 400);
    }
    try {
      if (!await authorize(authorization, body.organization_id)) return json({ error: "Недостаточно прав для оплаты организации" }, 403);
      const { data: postpaid, error: billingError } = await db.rpc("has_active_postpaid_agreement", { p_organization_id: body.organization_id });
      if (billingError || typeof postpaid !== "boolean") throw new Error("Billing agreement unavailable");
      if (postpaid) return json({ error: "Организация оплачивает фактическое использование по счёту после окончания периода." }, 409);
      const { data: org, error: orgError } = await db.from("organizations")
        .select("subscription_plan, custom_price, custom_discount").eq("id", body.organization_id).single();
      if (orgError || !org) throw new Error("Organization quote unavailable");
      const plan = body.plan;
      const months: 1 | 12 = body.period_months === 12 ? 12 : 1;
      // Negotiated current-plan terms apply to renewal. Choosing another plan
      // uses its published tariff; caller-supplied amount/discount is ignored.
      const renewal = org.subscription_plan === plan;
      const amountKopecks = subscriptionQuoteKopecks(plan, months,
        renewal ? org.custom_price : null, renewal ? org.custom_discount : null);
      if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0) {
        return json({ error: "Для этого тарифа онлайн-оплата не требуется. Обратитесь к администратору." }, 409);
      }
      const settings = await resolveTbankCredentials(db, body.organization_id, true);
      const id = crypto.randomUUID();
      const orderId = `sub_${id.replace(/-/g, "").slice(0, 28)}`;
      // A count-based sequence produces duplicate document numbers when two
      // checkout requests overlap. The stored order is independently unique.
      const invoiceNumber = `ОПЛ-${new Date().getFullYear()}/${orderId.slice(4)}`;
      const { data: invoice, error: insertError } = await db.from("subscription_invoices").insert({
        id, organization_id: body.organization_id, invoice_number: invoiceNumber,
        plan, amount: amountKopecks / 100, period_months: months, status: "pending", payment_method: "tbank",
        tbank_order_id: orderId, tbank_terminal_key: settings.terminalKey,
      }).select("id").single();
      if (insertError || invoice?.id !== id) throw new Error("Could not persist checkout identity");

      const description = `Подписка «${names[plan]}» — ${months} мес.`;
      const params = {
        TerminalKey: settings.terminalKey, Amount: String(amountKopecks), OrderId: orderId, Description: description,
        SuccessURL: "https://sintagma.com.ru/payment-success?type=subscription",
        FailURL: "https://sintagma.com.ru/payment-fail?type=subscription",
        NotificationURL: `${supabaseUrl}/functions/v1/tbank-webhook`, Language: "ru",
      };
      const payload: Record<string, unknown> = {
        ...params, Token: await generateTbankToken(params, settings.password),
        DATA: { connection_type: req.headers.get("x-connection-type") === "Widget" ? "Widget" : "redirect" },
      };
      if (body.email) payload.Receipt = {
        Email: body.email, Taxation: "usn_income", Items: [{
          Name: description, Price: amountKopecks, Quantity: 1, Amount: amountKopecks,
          Tax: "none", PaymentMethod: "full_payment", PaymentObject: "service",
        }],
      };
      // Preserve the existing subscription gateway endpoint (test terminals use
      // their own credentials). Do not infer another merchant from user input.
      const response = await request("https://securepay.tinkoff.ru/v2/Init", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok || result.Success !== true || !/^[0-9]{1,30}$/.test(String(result.PaymentId ?? ""))
        || typeof result.PaymentURL !== "string" || !result.PaymentURL.startsWith("https://")) {
        return json({ error: "Банк не подтвердил создание платежа. Повторите попытку позже." }, 502);
      }
      const { error: saveError } = await db.from("subscription_invoices")
        .update({ payment_id: String(result.PaymentId) }).eq("id", id);
      if (saveError) throw new Error("Could not bind bank payment identity");
      return json({ url: result.PaymentURL, invoice_id: id, amount: amountKopecks / 100 });
    } catch {
      return json({ error: "Не удалось подготовить оплату. Повторите попытку позже." }, 500);
    }
  };
}
