export interface DemoRequestTracking {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  yclid: string;
  page_url: string;
  referrer: string;
}

export interface DemoRequestInput {
  name: string;
  organization: string;
  phone: string;
  email: string;
  slot: string;
  message: string;
  source: string;
  tracking: DemoRequestTracking;
}

export type NotificationDelivery = "sent" | "failed";

export const TELEGRAM_MESSAGE_MAX_LENGTH = 4_000;

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function limitedString(value: unknown, maxLength: number): string {
  return trimmedString(value).slice(0, maxLength);
}

export function normalizeDemoRequestTracking(value: unknown): DemoRequestTracking {
  const tracking = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

  return {
    utm_source: limitedString(tracking.utm_source, 128),
    utm_medium: limitedString(tracking.utm_medium, 128),
    utm_campaign: limitedString(tracking.utm_campaign, 128),
    utm_term: limitedString(tracking.utm_term, 128),
    utm_content: limitedString(tracking.utm_content, 128),
    yclid: limitedString(tracking.yclid, 128),
    page_url: limitedString(tracking.page_url, 1_024),
    referrer: limitedString(tracking.referrer, 1_024),
  };
}

export function normalizeDemoRequestInput(value: unknown): DemoRequestInput {
  const body = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

  return {
    name: trimmedString(body.name),
    organization: trimmedString(body.organization),
    phone: trimmedString(body.phone),
    email: trimmedString(body.email),
    slot: trimmedString(body.slot),
    message: trimmedString(body.message),
    source: trimmedString(body.source) || "demonstration_page",
    tracking: normalizeDemoRequestTracking(body.tracking),
  };
}

export function buildAttributionLines(tracking: DemoRequestTracking): string[] {
  const fields: Array<[keyof DemoRequestTracking, string]> = [
    ["utm_source", "UTM source"],
    ["utm_medium", "UTM medium"],
    ["utm_campaign", "UTM campaign"],
    ["utm_term", "UTM term"],
    ["utm_content", "UTM content"],
    ["yclid", "Yandex click ID"],
    ["page_url", "Посадочная страница"],
    ["referrer", "Реферер"],
  ];

  return fields.flatMap(([key, label]) => (
    tracking[key] ? [`${label}: ${tracking[key]}`] : []
  ));
}

export function isReasonablePhone(value: string): boolean {
  const digitCount = value.replace(/\D/g, "").length;
  return digitCount >= 10 && digitCount <= 15;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function telegramValue(value: string, maxLength: number): string {
  let escaped = "";
  for (const character of value || "—") {
    const encoded = escapeHtml(character);
    if (escaped.length + encoded.length > maxLength) break;
    escaped += encoded;
  }
  return escaped;
}

function telegramField(label: string, value: string, valueLimit: number): string {
  return `<b>${label}:</b> ${telegramValue(value, valueLimit)}`;
}

function emailHtmlValue(value: string): string {
  return escapeHtml(value || "—").replace(/\r?\n/g, "<br>");
}

export function buildTelegramMessage(input: DemoRequestInput): string {
  const attribution = buildAttributionLines(input.tracking);
  const lines = [
    "<b>Новая заявка на демонстрацию</b>",
    telegramField("Имя", input.name, 256),
    telegramField("Организация", input.organization, 384),
    telegramField("Телефон", input.phone, 128),
    telegramField("Email", input.email, 384),
    telegramField("Удобное время", input.slot, 192),
    telegramField("Комментарий", input.message, 1_024),
    telegramField("Источник", input.source, 192),
  ];

  if (attribution.length > 0) {
    lines.push("<b>Атрибуция:</b>");
    for (const item of attribution) {
      const remaining = TELEGRAM_MESSAGE_MAX_LENGTH - lines.join("\n").length - 1;
      if (remaining <= 0) break;

      const fitted = telegramValue(item, Math.min(remaining, 512));
      if (!fitted) break;
      lines.push(fitted);
    }
  }

  return lines.join("\n");
}

export function buildEmailSubject(input: DemoRequestInput): string {
  const name = input.name.replace(/[\r\n]+/g, " ");
  const organization = input.organization.replace(/[\r\n]+/g, " ");
  return `Новая заявка на демо: ${name}${organization ? ` (${organization})` : ""}`;
}

export function buildEmailHtml(input: DemoRequestInput): string {
  const attribution = buildAttributionLines(input.tracking);
  const attributionHtml = attribution.length > 0
    ? `<p><b>Атрибуция:</b><br>${attribution.map(emailHtmlValue).join("<br>")}</p>`
    : "";

  return `
    <h2>Заявка с /demonstration</h2>
    <p><b>Имя:</b> ${emailHtmlValue(input.name)}</p>
    <p><b>Организация:</b> ${emailHtmlValue(input.organization)}</p>
    <p><b>Телефон:</b> ${emailHtmlValue(input.phone)}</p>
    <p><b>Email:</b> ${emailHtmlValue(input.email)}</p>
    <p><b>Слот:</b> ${emailHtmlValue(input.slot)}</p>
    <p><b>Комментарий:</b><br>${emailHtmlValue(input.message)}</p>
    ${attributionHtml}
  `;
}

export function notificationInvokeSucceeded(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === "object" &&
      (result as Record<string, unknown>).success === true,
  );
}
