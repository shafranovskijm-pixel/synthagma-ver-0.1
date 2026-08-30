export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TELEGRAM_TEXT_LIMIT = 4_000;

export type SubscriptionPlan = "free" | "start" | "standard" | "professional" | "maximum";

export function trimmed(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function uuid(value: unknown): string {
  const candidate = trimmed(value, 64).toLowerCase();
  return UUID_PATTERN.test(candidate) ? candidate : "";
}

export function phoneDigits(value: unknown): string {
  return trimmed(value, 64).replace(/\D/g, "");
}

export function isReasonablePhone(value: string): boolean {
  const digits = phoneDigits(value);
  return digits.length >= 10 && digits.length <= 15;
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function value(value: unknown, limit: number): string {
  const raw = trimmed(value, limit) || "—";
  let escaped = "";
  for (const character of raw) {
    const encoded = escapeTelegramHtml(character);
    if (escaped.length + encoded.length > limit) break;
    escaped += encoded;
  }
  return escaped || "—";
}

function field(label: string, fieldValue: unknown, limit = 512): string {
  return `<b>${label}:</b> ${value(fieldValue, limit)}`;
}

function fit(lines: string[]): string {
  const accepted: string[] = [];
  let length = 0;
  for (const line of lines) {
    const extra = (accepted.length > 0 ? 1 : 0) + line.length;
    if (length + extra > TELEGRAM_TEXT_LIMIT) continue;
    accepted.push(line);
    length += extra;
  }
  return accepted.join("\n");
}

export function buildSpecialOfferMessage(input: {
  name: string;
  phone: string;
  popupTitle: string;
  sourceTag: string;
}): string {
  return fit([
    "🎁 <b>Заявка со спецпредложения</b>",
    "",
    field("Имя", input.name, 200),
    field("Телефон", input.phone, 64),
    field("Предложение", input.popupTitle, 300),
    field("Источник", input.sourceTag, 100),
  ]);
}

export function buildOrganizationRegistrationMessage(input: {
  name: string;
  contactName: string | null;
  email: string;
  phone: string | null;
  inn: string | null;
  requestedPlan: string | null;
  promoCode: string | null;
}): string {
  return fit([
    "🏢 <b>Новая организация зарегистрирована</b>",
    "",
    field("Название", input.name, 300),
    field("Контактное лицо", input.contactName, 200),
    field("Email", input.email, 320),
    field("Телефон", input.phone, 64),
    field("ИНН", input.inn, 32),
    field("Выбранный тариф", input.requestedPlan || "Бесплатный", 64),
    ...(input.promoCode ? [field("Промокод", input.promoCode, 64)] : []),
  ]);
}

export function buildSupportRequestMessage(input: {
  userName: string | null;
  userEmail: string | null;
  role: string;
  organizationId: string | null;
  description: string;
  contactPhone: string | null;
  browserInfo: string | null;
  pageUrl: string | null;
  errorLogs: string | null;
  screenshotUrl: string | null;
}): string {
  return fit([
    "🆘 <b>Обращение в поддержку</b>",
    "",
    field("Пользователь", input.userName, 200),
    field("Email", input.userEmail, 320),
    field("Роль", input.role, 64),
    ...(input.contactPhone ? [field("Телефон для связи", input.contactPhone, 64)] : []),
    ...(input.organizationId ? [field("Организация ID", input.organizationId, 64)] : []),
    "",
    field("Описание проблемы", input.description, 1_000),
    ...(input.browserInfo ? [field("Браузер", input.browserInfo, 200)] : []),
    ...(input.pageUrl ? [field("URL", input.pageUrl, 1_024)] : []),
    ...(input.errorLogs ? [field("Последние ошибки", input.errorLogs, 1_000)] : []),
    ...(input.screenshotUrl ? [field("Скриншот", input.screenshotUrl, 1_024)] : []),
  ]);
}

export function buildOrganizationTelegramTestMessage(organizationName: string): string {
  return fit([
    "🎉 <b>Тестовое уведомление от Синтагмы</b>",
    field("Организация", organizationName, 300),
    "Настройка Telegram работает.",
  ]);
}

export function buildSubscriptionUpgradeMessage(input: {
  organizationName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  currentPlan: string;
  requestedPlan: string;
  requestedPlanName: string;
  monthlyPrice: number | null;
  comment: string | null;
}): string {
  return fit([
    "📋 <b>Заявка на изменение тарифа</b>",
    "",
    field("Организация", input.organizationName, 300),
    ...(input.contactName ? [field("Контакт", input.contactName, 200)] : []),
    ...(input.email ? [field("Email", input.email, 320)] : []),
    ...(input.phone ? [field("Телефон", input.phone, 64)] : []),
    field("Текущий тариф", input.currentPlan, 64),
    field("Запрошенный тариф", `${input.requestedPlanName} (${input.requestedPlan})`, 128),
    ...(input.monthlyPrice === null ? [] : [field("Стоимость", `${input.monthlyPrice.toLocaleString("ru-RU")} ₽/мес`, 64)]),
    ...(input.comment ? [field("Комментарий", input.comment, 1_000)] : []),
  ]);
}

export function normalizeSubscriptionPlan(value: unknown): SubscriptionPlan | null {
  const plan = trimmed(value, 32) as SubscriptionPlan;
  return ["free", "start", "standard", "professional", "maximum"].includes(plan)
    ? plan
    : null;
}
