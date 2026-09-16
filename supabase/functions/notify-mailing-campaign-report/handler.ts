import { deliverMailingReport } from "./report.ts";

interface Dependencies {
  env(key: string): string | undefined;
  createAdmin(): any;
  newToken?(): string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const chatPattern = /^-?\d{5,20}$/;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

export function createMailingReportHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const service = deps.env("SUPABASE_SERVICE_ROLE_KEY") || "";
    const expectedCron = deps.env("MAILING_CAMPAIGN_CRON_SECRET") || "";
    const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const cron = request.headers.get("X-Cron-Secret") || "";
    if (!(service && bearer === service) && !(expectedCron.length >= 24 && cron === expectedCron)) return json({ error: "unauthorized" }, 401);
    if (!service) return json({ error: "service_configuration_missing" }, 503);
    try {
      const raw = await request.text();
      if (raw.length > 4096) return json({ error: "body_too_large" }, 413);
      let body: any;
      try { body = JSON.parse(raw || "{}"); } catch { return json({ error: "invalid_json" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["campaignId", "eventId"].includes(key))) return json({ error: "invalid_request" }, 400);
      if ([body.campaignId, body.eventId].some((id) => id !== undefined && (typeof id !== "string" || !uuid.test(id)))) return json({ error: "invalid_id" }, 400);
      const admin = deps.createAdmin();
      // Eligibility is applied before LIMIT in SQL, so old unconfigured orgs
      // cannot starve reports for another organization or the platform.
      const { data: candidates, error } = await admin.rpc("list_ordinary_mail_report_candidates", {
        p_platform_ready: chatPattern.test((deps.env("TELEGRAM_SUPPORT_CHAT_ID") || "").trim()),
        p_bot_ready: !!deps.env("TELEGRAM_BOT_TOKEN")?.trim(),
        p_campaign_id: body.campaignId ?? null, p_event_id: body.eventId ?? null, p_limit: 20,
      });
      const events = candidates?.events;
      if (error || !Array.isArray(events) || !Number.isSafeInteger(candidates?.blocked) || candidates.blocked < 0) return json({ error: "report_lookup_failed" }, 503);
      const result = { inspected: events.length, sent: 0, uncertain: 0, failed: 0, blocked: candidates.blocked, not_claimed: 0 };
      for (const event of events) {
        // Existing bindings only. No chat ID, bot token or payload accepted from body.
        let chatId = "";
        if (event.scope === "platform") chatId = (deps.env("TELEGRAM_SUPPORT_CHAT_ID") || "").trim();
        else if (event.scope === "org" && event.organization_id) {
          const { data: org, error: orgError } = await admin.from("organizations")
            .select("telegram_notify_enabled,telegram_notify_chat_id").eq("id", event.organization_id).maybeSingle();
          if (!orgError && org?.telegram_notify_enabled === true) chatId = String(org.telegram_notify_chat_id || "").trim();
        }
        if (!chatPattern.test(chatId) || !deps.env("TELEGRAM_BOT_TOKEN")?.trim()) { result.blocked++; continue; }
        const outcome = await deliverMailingReport({
          eventId: event.id, token: deps.newToken?.() || crypto.randomUUID(), chatId,
          store: {
            claim: async (id, token, target) => {
              const { data, error } = await admin.rpc("claim_ordinary_mail_report", { p_event_id: id, p_claim_token: token, p_target_chat_id: target });
              if (error) throw new Error("report_claim_failed");
              return data;
            },
            finish: async (id, token, state, telegramId, category) => {
              const { data, error } = await admin.rpc("finish_ordinary_mail_report", {
                p_event_id: id, p_claim_token: token, p_state: state,
                p_telegram_message_id: telegramId, p_error_category: category,
              });
              if (error) throw new Error("report_finish_failed");
              return data;
            },
          },
          relay: (target, message) => admin.functions.invoke("send-telegram-notification", { body: { chat_id: target, message } }),
        });
        if (outcome === "sent") result.sent++;
        else if (outcome === "failed") result.failed++;
        else if (outcome === "not_claimed") result.not_claimed++;
        else result.uncertain++;
      }
      return json({ ok: true, ...result });
    } catch {
      return json({ error: "mail_report_processing_failed" }, 503);
    }
  };
}
