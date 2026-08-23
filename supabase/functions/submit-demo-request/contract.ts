export interface DemoRequestInput {
  name: string;
  organization: string;
  phone: string;
  email: string;
  slot: string;
  message: string;
  source: string;
}

export type NotificationDelivery = "sent" | "failed";

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
  };
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

function telegramValue(value: string): string {
  return escapeHtml(value || "—");
}

function emailHtmlValue(value: string): string {
  return escapeHtml(value || "—").replace(/\r?\n/g, "<br>");
}

export function buildTelegramMessage(input: DemoRequestInput): string {
  return [
    "<b>Новая заявка на демонстрацию</b>",
    `<b>Имя:</b> ${telegramValue(input.name)}`,
    `<b>Организация:</b> ${telegramValue(input.organization)}`,
    `<b>Телефон:</b> ${telegramValue(input.phone)}`,
    `<b>Email:</b> ${telegramValue(input.email)}`,
    `<b>Удобное время:</b> ${telegramValue(input.slot)}`,
    `<b>Комментарий:</b> ${telegramValue(input.message)}`,
    `<b>Источник:</b> ${telegramValue(input.source)}`,
  ].join("\n");
}

export function buildEmailSubject(input: DemoRequestInput): string {
  const name = input.name.replace(/[\r\n]+/g, " ");
  const organization = input.organization.replace(/[\r\n]+/g, " ");
  return `Новая заявка на демо: ${name}${organization ? ` (${organization})` : ""}`;
}

export function buildEmailHtml(input: DemoRequestInput): string {
  return `
    <h2>Заявка с /demonstration</h2>
    <p><b>Имя:</b> ${emailHtmlValue(input.name)}</p>
    <p><b>Организация:</b> ${emailHtmlValue(input.organization)}</p>
    <p><b>Телефон:</b> ${emailHtmlValue(input.phone)}</p>
    <p><b>Email:</b> ${emailHtmlValue(input.email)}</p>
    <p><b>Слот:</b> ${emailHtmlValue(input.slot)}</p>
    <p><b>Комментарий:</b><br>${emailHtmlValue(input.message)}</p>
  `;
}

export function notificationInvokeSucceeded(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === "object" &&
      (result as Record<string, unknown>).success === true,
  );
}
