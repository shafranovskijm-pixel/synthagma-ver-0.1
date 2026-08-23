import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildEmailHtml,
  buildEmailSubject,
  buildTelegramMessage,
  isReasonablePhone,
  normalizeDemoRequestInput,
  notificationInvokeSucceeded,
  type NotificationDelivery,
} from "./contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "invalid_json" }, 400);
    }

    const input = normalizeDemoRequestInput(requestBody);
    if (!input.name || !input.phone) {
      return jsonResponse({ ok: false, error: "name_and_phone_required" }, 400);
    }
    if (!isReasonablePhone(input.phone)) {
      return jsonResponse({ ok: false, error: "invalid_phone" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const notes = [
      `Контакт: ${input.name}`,
      input.slot ? `Удобное время: ${input.slot}` : null,
      input.message ? `Комментарий: ${input.message}` : null,
      `Источник: ${input.source}`,
    ].filter(Boolean).join("\n");

    const { data: lead, error: leadError } = await supabase
      .from("sales_leads")
      .insert({
        org_name: input.organization || input.name,
        phone: input.phone,
        email: input.email || null,
        notes,
        status: "new",
        source: "demo_request",
      })
      .select("id")
      .single();

    if (leadError || !lead?.id) {
      console.error("submit-demo-request: lead insert failed", {
        code: leadError?.code || "missing_lead_id",
      });
      return jsonResponse({
        ok: false,
        error: "lead_persistence_failed",
        delivery: {
          lead: "failed",
          telegram: "not_attempted",
          email: "not_attempted",
        },
      }, 500);
    }

    let telegramDelivery: NotificationDelivery = "failed";
    try {
      const supportChatId = Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID")?.trim();
      const telegramBody: Record<string, string> = {
        message: buildTelegramMessage(input),
      };
      if (supportChatId) telegramBody.chat_id = supportChatId;

      const { data: telegramResult, error: telegramError } = await supabase.functions.invoke(
        "send-telegram-notification",
        { body: telegramBody },
      );

      if (!telegramError && notificationInvokeSucceeded(telegramResult)) {
        telegramDelivery = "sent";
      } else {
        console.error("submit-demo-request: Telegram notification failed", {
          invokeError: Boolean(telegramError),
          resultAccepted: notificationInvokeSucceeded(telegramResult),
        });
      }
    } catch {
      console.error("submit-demo-request: Telegram notification threw");
    }

    // Email is deliberately best-effort: the persisted lead remains accepted.
    let emailDelivery: NotificationDelivery = "failed";
    try {
      const { data: emailResult, error: emailError } = await supabase.functions.invoke(
        "send-email",
        {
          body: {
            to: Deno.env.get("SALES_NOTIFY_EMAIL") || "sales@sintagma.com.ru",
            subject: buildEmailSubject(input),
            html: buildEmailHtml(input),
          },
        },
      );

      if (!emailError && notificationInvokeSucceeded(emailResult)) {
        emailDelivery = "sent";
      } else {
        console.error("submit-demo-request: email notification failed", {
          invokeError: Boolean(emailError),
          resultAccepted: notificationInvokeSucceeded(emailResult),
        });
      }
    } catch {
      console.error("submit-demo-request: email notification threw");
    }

    return jsonResponse({
      ok: true,
      lead_id: lead.id,
      delivery: {
        lead: "stored",
        telegram: telegramDelivery,
        email: emailDelivery,
      },
    });
  } catch (error: unknown) {
    console.error(
      "submit-demo-request: unexpected failure",
      error instanceof Error ? error.name : "unknown_error",
    );
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});
