/** Closed operational events for non-AI external transports; never accepts payload text or identity metadata. */
const events = new Set(["operation_failed", "smtp_notification_started", "smtp_recipients_ready", "smtp_delivery_succeeded", "smtp_delivery_failed", "telephony_webhook_received", "video_upload_init_failed", "video_recording_list_failed", "company_html_unmatched", "support_topic_created", "support_topic_failed", "support_delivery_failed", "telegram_notification_failed", "video_recording_stop_failed"]);
export type ExternalOperationEvent = "operation_failed" | "smtp_notification_started" | "smtp_recipients_ready" | "smtp_delivery_succeeded" | "smtp_delivery_failed" | "telephony_webhook_received" | "video_upload_init_failed" | "video_recording_list_failed" | "company_html_unmatched" | "support_topic_created" | "support_topic_failed" | "support_delivery_failed" | "telegram_notification_failed" | "video_recording_stop_failed";
export function logExternalOperation(level: "log" | "warn" | "error", event: ExternalOperationEvent, status?: number): void {
  const safeLevel = level === "log" || level === "error" ? level : "warn";
  const safeEvent = events.has(event) ? event : "operation_failed";
  const code = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  console[safeLevel]("[ExternalOperation]", { event: safeEvent, ...(code === undefined ? {} : { status: code }) });
}
