import { isEmail } from "@/lib/mailing/senderPresets";

export type DeliverabilityProvider = "gmail" | "yandex" | "mailru" | "custom";

export interface DeliverabilitySeedPreset {
  key: DeliverabilityProvider;
  label: string;
  imapHost: string;
  imapPort: number;
  hint: string;
}

export const DELIVERABILITY_SEED_PRESETS: DeliverabilitySeedPreset[] = [
  {
    key: "gmail",
    label: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    hint: "Нужны двухэтапная аутентификация и отдельный пароль приложения.",
  },
  {
    key: "yandex",
    label: "Яндекс",
    imapHost: "imap.yandex.ru",
    imapPort: 993,
    hint: "Нужен отдельный пароль приложения с доступом к почте.",
  },
  {
    key: "mailru",
    label: "Mail.ru",
    imapHost: "imap.mail.ru",
    imapPort: 993,
    hint: "Нужен пароль для внешнего приложения.",
  },
  {
    key: "custom",
    label: "Другой провайдер",
    imapHost: "",
    imapPort: 993,
    hint: "Укажите IMAP-хост провайдера. Для Timeweb: imap.timeweb.ru, порт 993, SSL/TLS.",
  },
];

export interface DeliverabilitySeedDraft {
  provider: DeliverabilityProvider;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  appPassword: string;
}

export function seedPreset(key: DeliverabilityProvider) {
  return DELIVERABILITY_SEED_PRESETS.find((preset) => preset.key === key)!;
}

export function emptyDeliverabilitySeedDraft(): DeliverabilitySeedDraft {
  const preset = seedPreset("gmail");
  return {
    provider: preset.key,
    label: preset.label,
    email: "",
    imapHost: preset.imapHost,
    imapPort: preset.imapPort,
    imapUsername: "",
    appPassword: "",
  };
}

export function applyDeliverabilitySeedPreset(
  draft: DeliverabilitySeedDraft,
  provider: DeliverabilityProvider,
): DeliverabilitySeedDraft {
  const preset = seedPreset(provider);
  return {
    ...draft,
    provider,
    label: preset.label,
    imapHost: preset.imapHost,
    imapPort: preset.imapPort,
  };
}

export function validateDeliverabilitySeedDraft(draft: DeliverabilitySeedDraft) {
  if (!draft.label.trim()) return { ok: false, reason: "Укажите название контрольного ящика" };
  if (!isEmail(draft.email)) return { ok: false, reason: "Некорректный email" };
  if (!draft.imapHost.trim()) return { ok: false, reason: "Укажите IMAP-хост" };
  if (!Number.isInteger(draft.imapPort) || draft.imapPort < 1 || draft.imapPort > 65535) {
    return { ok: false, reason: "Некорректный IMAP-порт" };
  }
  if (!draft.imapUsername.trim()) return { ok: false, reason: "Укажите IMAP-логин" };
  if (!draft.appPassword.trim()) {
    return { ok: false, reason: "Укажите пароль ящика или пароль приложения" };
  }
  return { ok: true as const };
}

export function toDeliverabilitySeedRow(draft: DeliverabilitySeedDraft, organizationId: string) {
  return {
    organization_id: organizationId,
    provider: draft.provider,
    label: draft.label.trim(),
    email: draft.email.trim().toLowerCase(),
    imap_host: draft.imapHost.trim(),
    imap_port: draft.imapPort,
    imap_security: "ssl",
    imap_username: draft.imapUsername.trim(),
    secret_encrypted: draft.appPassword.trim(),
  };
}

export function providerForEmail(email: string): DeliverabilityProvider {
  const domain = email.trim().toLowerCase().split("@")[1] || "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "gmail";
  if (domain === "ya.ru" || domain === "yandex.ru") return "yandex";
  if (domain === "mail.ru" || domain === "inbox.ru" || domain === "bk.ru" || domain === "list.ru") {
    return "mailru";
  }
  return "custom";
}
