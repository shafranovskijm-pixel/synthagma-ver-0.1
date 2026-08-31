import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildAttributionLines,
  buildEmailHtml,
  buildEmailSubject,
  buildTelegramMessage,
  isReasonablePhone,
  normalizeDemoRequestInput,
  notificationInvokeSucceeded,
  type NotificationDelivery,
} from "./contract.ts";
import {
  attemptDemoTelegramDelivery,
  createDemoTelegramMetadata,
  DEMO_NOTIFICATION_TYPE,
  isDemoNotificationRecord,
} from "../_shared/demoTelegramDelivery.ts";

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
      ...buildAttributionLines(input.tracking),
    ].filter(Boolean).join("\n");

    const leadId = input.request_id || crypto.randomUUID();
    const leadPayload = {
      id: leadId,
      org_name: input.organization || input.name,
      phone: input.phone,
      email: input.email || null,
      notes,
      status: "new",
      source: "demo_request",
    };

    const { data: insertedLead, error: leadError } = await supabase
      .from("sales_leads")
      .insert(leadPayload)
      .select("id, org_name, phone, email, notes, source")
      .maybeSingle();

    let lead = insertedLead;
    let leadWasCreated = Boolean(insertedLead?.id && !leadError);

    if (leadError?.code === "23505") {
      const { data: existingLead, error: existingLeadError } = await supabase
        .from("sales_leads")
        .select("id, org_name, phone, email, notes, source")
        .eq("id", leadId)
        .maybeSingle();

      const matchesOriginalRequest = Boolean(
        existingLead &&
          existingLead.source === "demo_request" &&
          existingLead.org_name === leadPayload.org_name &&
          existingLead.phone === leadPayload.phone &&
          (existingLead.email || null) === leadPayload.email &&
          (existingLead.notes || "") === leadPayload.notes,
      );

      if (existingLeadError || !matchesOriginalRequest) {
        return jsonResponse({ ok: false, error: "request_id_conflict" }, 409);
      }
      lead = existingLead;
      leadWasCreated = false;
    } else if (leadError) {
      console.error("submit-demo-request: lead insert failed", {
        code: leadError.code || "missing_lead_id",
      });
    }

    if (!lead?.id) {
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

    const telegramMessage = buildTelegramMessage(input);
    const deliveryMetadata = createDemoTelegramMetadata(lead.id, telegramMessage);
    const { error: notificationInsertError } = await supabase
      .from("admin_notifications")
      .upsert({
        id: lead.id,
        type: DEMO_NOTIFICATION_TYPE,
        title: "Заявка на демо сохранена",
        message: "Лид сохранён в разделе «Продажи». Доставка в Telegram ожидает подтверждения.",
        is_read: false,
        metadata: deliveryMetadata,
        related_entity_id: lead.id,
      }, { onConflict: "id", ignoreDuplicates: true });

    let telegramDelivery: NotificationDelivery = "failed";
    if (!notificationInsertError) {
      const { data: deliveryRecord, error: deliveryRecordError } = await supabase
        .from("admin_notifications")
        .select("id, related_entity_id, type, metadata")
        .eq("id", lead.id)
        .maybeSingle();

      if (!deliveryRecordError && deliveryRecord && isDemoNotificationRecord(deliveryRecord)) {
        telegramDelivery = await attemptDemoTelegramDelivery(supabase, deliveryRecord);
      } else {
        console.error("submit-demo-request: durable delivery record is unavailable");
      }
    } else {
      console.error("submit-demo-request: durable delivery record insert failed", {
        code: notificationInsertError.code || "unknown",
      });
    }

    if (telegramDelivery === "failed") {
      const warning = "Системное уведомление: доставку заявки в Telegram требуется проверить вручную.";
      const durableNotes = lead.notes?.includes(warning)
        ? lead.notes
        : `${lead.notes || notes}\n\n${warning}`;
      const { error: leadWarningError } = await supabase
        .from("sales_leads")
        .update({ notes: durableNotes })
        .eq("id", lead.id);
      if (leadWarningError) {
        console.error("submit-demo-request: lead delivery warning update failed", {
          code: leadWarningError.code || "unknown",
        });
      }
    }

    // Email is deliberately best-effort: the persisted lead remains accepted.
    let emailDelivery: NotificationDelivery = "not_attempted";
    try {
      if (!leadWasCreated) {
        throw new Error("idempotent_retry_skips_email");
      }
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
        emailDelivery = "failed";
        console.error("submit-demo-request: email notification failed", {
          invokeError: Boolean(emailError),
          resultAccepted: notificationInvokeSucceeded(emailResult),
        });
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "idempotent_retry_skips_email") {
        emailDelivery = "not_attempted";
      } else {
        emailDelivery = "failed";
        console.error("submit-demo-request: email notification threw");
      }
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
