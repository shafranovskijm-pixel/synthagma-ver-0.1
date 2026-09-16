type Json = Record<string, any>;

/** Render only an immutable server event. Never accept message text from HTTP. */
export function buildMailingReport(kind: string, payload: Json): string {
  const esc = (value: unknown, max = 300) => String(value ?? "").slice(0, max)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\u0000/g, "");
  const id = String(payload.campaign_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !String(payload.campaign_name || "").trim()) {
    throw new Error("invalid_report_payload");
  }
  const name = esc(payload.campaign_name, 180);
  if (kind === "reply") {
    const reply = payload.reply;
    if (!reply || !reply.from_email) throw new Error("invalid_reply_payload");
    const label = reply.classification === "auto_reply" ? "Автоматический ответ" : "Ответ на рассылку";
    // Bound the escaped text, not only raw input: HTML entities expand length.
    const excerpt = Array.from(String(reply.text || "").replace(/\u0000/g, "")).slice(0, 1200).join("");
    const safeExcerpt = esc(excerpt, 1200);
    const text = [
      `<b>${label} СИНТАГМА</b>`, name,
      `От: ${esc(reply.from_name, 100)} &lt;${esc(reply.from_email, 254)}&gt;`,
      `Тема: ${esc(reply.subject, 160)}`,
      `Получено: ${esc(reply.received_at, 40)}`,
      "",
      safeExcerpt.length <= 2200 ? safeExcerpt : "Текст длинный — откройте письмо в переписках СИНТАГМЫ.",
      "", `Кампания: <code>${id}</code>`,
      "Связь подтверждена заголовками ответа. Это не подтверждение покупки.",
    ].join("\n");
    if (text.length > 3900) throw new Error("report_too_long");
    return text;
  }
  if (kind !== "run_report") throw new Error("unknown_report_kind");
  const counts = payload.counts;
  for (const key of ["total", "pending", "sent", "failed", "unresolved"]) {
    if (!Number.isSafeInteger(counts?.[key]) || counts[key] < 0) throw new Error("invalid_report_counts");
  }
  const status = ({ completed: "Обработка завершена", paused: "На паузе", failed: "Ошибка", draft: "Оставлена черновиком" } as Json)[payload.status] || "Состояние требует проверки";
  const senders = Array.isArray(payload.senders) ? [...new Set(payload.senders.map((s: Json) => String(s.from_email || "")).filter(Boolean))] : [];
  const senderLine = senders.length ? senders.slice(0, 3).map((email) => esc(email, 254)).join(", ") : "SMTP-отправитель ещё не зафиксирован";
  const text = [
    "<b>Отчёт о рассылке СИНТАГМА</b>", name, status,
    `Получателей: ${counts.total}`,
    `Принято почтовым сервером: ${counts.sent}`,
    `Не отправлено (зафиксирован отказ): ${counts.failed}`,
    `В очереди, включая требующие сверки: ${counts.pending}`,
    `Попыток, требующих сверки: ${counts.unresolved}`,
    `Фактический From: ${senderLine}${senders.length > 3 ? " и другие" : ""}`,
    `Состояние на: ${esc(payload.occurred_at, 40)}`,
    "", "Приём SMTP не подтверждает попадание во «Входящие», прочтение или заявку.",
    counts.unresolved ? "Неопределённые попытки автоматически не повторяются." : "",
    `Кампания: <code>${id}</code>`,
  ].filter(Boolean).join("\n");
  if (text.length > 3900) throw new Error("report_too_long");
  return text;
}

export interface ReportStore {
  claim(eventId: string, token: string, chatId: string): Promise<any>;
  finish(eventId: string, token: string, state: "sent" | "failed" | "uncertain", messageId: number | null, category: string | null): Promise<any>;
}

/** One durable claim, one relay invocation. No transport retry on ambiguity. */
export async function deliverMailingReport(input: {
  eventId: string; token: string; chatId: string; store: ReportStore;
  relay(chatId: string, message: string): Promise<{ data?: any; error?: unknown }>;
}) {
  let claimed: any;
  try { claimed = await input.store.claim(input.eventId, input.token, input.chatId); }
  catch { return "claim_unknown"; }
  if (claimed?.claimed !== true || claimed.claim_token !== input.token || claimed.event_id !== input.eventId || claimed.target_chat_id !== input.chatId) return "not_claimed";
  let message: string;
  try { message = buildMailingReport(claimed.kind, claimed.payload); }
  catch {
    try {
      const result = await input.store.finish(input.eventId, input.token, "failed", null, "invalid_report_payload");
      return result?.finished === true ? "failed" : "finalization_unknown";
    } catch { return "finalization_unknown"; }
  }
  let response: { data?: any; error?: unknown };
  try { response = await input.relay(input.chatId, message); }
  catch { response = { error: "relay_unknown" }; }
  const messageId = response.data?.message_id;
  const accepted = !response.error && response.data?.success === true && Number.isSafeInteger(messageId) && messageId > 0;
  try {
    const saved = await input.store.finish(input.eventId, input.token, accepted ? "sent" : "uncertain",
      accepted ? messageId : null, accepted ? null : "telegram_result_unknown");
    if (saved?.finished !== true || saved.state !== (accepted ? "sent" : "uncertain")) return "finalization_unknown";
    return accepted ? "sent" : "uncertain";
  } catch { return "finalization_unknown"; }
}
