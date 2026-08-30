export interface DemoRequestDelivery {
  lead?: "stored" | "failed" | "not_attempted";
  telegram?: "sent" | "failed" | "pending" | "not_attempted";
  email?: "sent" | "failed" | "not_attempted";
}

export interface DemoRequestResponse {
  ok: boolean;
  error?: string;
  lead_id?: string | null;
  delivery?: DemoRequestDelivery;
}

export function isReasonableDemoPhone(value: string): boolean {
  const digitCount = value.replace(/\D/g, "").length;
  return digitCount >= 10 && digitCount <= 15;
}

export function isDemoRequestAccepted(value: unknown): value is DemoRequestResponse & { ok: true } {
  if (!value || typeof value !== "object") return false;

  const response = value as Record<string, unknown>;
  if (response.ok !== true || typeof response.lead_id !== "string" || !response.lead_id.trim()) {
    return false;
  }

  if (response.delivery === undefined) return true;
  if (!response.delivery || typeof response.delivery !== "object") return false;
  return (response.delivery as Record<string, unknown>).lead === "stored";
}

export function demoRequestErrorMessage(value: unknown): string {
  const code = value && typeof value === "object"
    ? (value as Record<string, unknown>).error
    : null;

  if (code === "name_and_phone_required") {
    return "Укажите имя и телефон";
  }
  if (code === "invalid_phone") {
    return "Укажите телефон полностью";
  }

  return "Не удалось отправить заявку. Попробуйте ещё раз.";
}
