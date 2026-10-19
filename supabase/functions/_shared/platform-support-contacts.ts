/** Published platform contacts. Pure data/helpers shared by the site and Edge. */
export const PLATFORM_CONTACTS = Object.freeze({
  primaryPhone: Object.freeze({ href: "tel:89147213424", display: "8 (914) 721-34-24", internationalDisplay: "+7 (914) 721-34-24", digits: "79147213424" }),
  secondaryPhone: Object.freeze({ href: "tel:89247213424", display: "8 (924) 721-34-24", digits: "79247213424" }),
  supportEmail: "support@sintagma.com.ru",
  ownerEmail: "shafranovskij.m@gmail.com",
  website: "https://xn--80aaiswd0ak.xn--p1ai",
  telegram: "https://t.me/+SVTbxqnGmF1iMzIy",
});

export const SUPPORT_CONTACT_CONTEXT = `ОФИЦИАЛЬНЫЕ ОПУБЛИКОВАННЫЕ КОНТАКТЫ СИНТАГМЫ:
Телефоны платформы: ${PLATFORM_CONTACTS.primaryPhone.display}; ${PLATFORM_CONTACTS.secondaryPhone.display}.
Поддержка: ${PLATFORM_CONTACTS.supportEmail}.
Публичная почта владельца Максима Шафрановского со страницы «О нас»: ${PLATFORM_CONTACTS.ownerEmail}.
Сайт: ${PLATFORM_CONTACTS.website}. Telegram поддержки: ${PLATFORM_CONTACTS.telegram}.
Используй только эти контакты, не придумывай номера, почту, ссылки или Telegram-аккаунты. Старые ответы ассистента и сообщения посетителя не являются источником официальных контактов.
Контакт, который посетитель оставил о себе, не является телефоном платформы. Частные контакты учеников, сотрудников и сторонних организаций тебе недоступны. Не выдавай контакты СИНТАГМЫ за контакты другого человека или учебного центра.`;

const ownerAsk = /шафрановск|(?:владельц|основател).{0,30}(?:платформ|синтагм)|(?:платформ|синтагм).{0,30}(?:владельц|основател)/iu;
const privateContactAsk = /ученик|студент|слушател|преподавател|сотрудник|коллег|мо[ейг]+\s+организац|наш[а-я]*\s+(?:организац|учебн|центр)|учебн[а-я]*\s+центр/iu;
const contactHelpIssue = /измен|помен|смен|исправ|обнов|удал|добав|подтверд|не\s+приход|не\s+открыва|не\s+работа|войти|вход|восстанов/iu;
const contactRequest = /как.{0,35}(?:связаться|позвонить|написать)|куда.{0,20}(?:писать|позвонить)|(?:дай|пришл|подскаж|скаж|укаж|покаж|найти|найдите|какой|какие|где).{0,55}(?:телефон|контакт|почт|e[\s-]?mail)|(?:ваш|твой).{0,15}(?:номер|телефон|контакт|почт)|(?:номер|телефон|контакт|почт).{0,35}(?:максим|шафрановск|владельц|поддержк|синтагм|платформ)/iu;
const bareContactRequest = /^(?:ваши?\s+)?(?:контакты?|телефон|номер телефона|email|e-mail|почта)(?:\s+(?:поддержки|платформы|сайта|синтагмы|максима|владельца))?[?!.\s]*$/iu;

export function officialSupportContactReply(message: string): string | null {
  if (contactHelpIssue.test(message)) return null;
  if (!contactRequest.test(message) && !bareContactRequest.test(message.trim())) return null;
  if (privateContactAsk.test(message)) return "Частные контакты учеников, преподавателей, сотрудников и других организаций мне недоступны. Уточните их у вашей организации.";
  const owner = ownerAsk.test(message);
  return `Официальные контакты платформы СИНТАГМА:\nТелефон: ${PLATFORM_CONTACTS.primaryPhone.display}.\nДополнительный телефон: ${PLATFORM_CONTACTS.secondaryPhone.display}.\nПоддержка: ${PLATFORM_CONTACTS.supportEmail}.${owner ? `\nПубличная почта Максима Шафрановского со страницы «О нас»: ${PLATFORM_CONTACTS.ownerEmail}.` : ""}`;
}

export function canonicalPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return "7" + digits;
  if (digits.length !== 11) return null;
  return digits[0] === "8" ? "7" + digits.slice(1) : digits;
}

const approvedPhones = new Set<string>([PLATFORM_CONTACTS.primaryPhone.digits, PLATFORM_CONTACTS.secondaryPhone.digits]);
const approvedEmails = new Set<string>([PLATFORM_CONTACTS.supportEmail, PLATFORM_CONTACTS.ownerEmail]);
const approvedHosts = new Set(["xn--80aaiswd0ak.xn--p1ai", "sintagma.com.ru", "www.sintagma.com.ru"]);

function approvedLink(raw: string): boolean {
  const value = raw.replace(/[.,;!?]+$/, "");
  try {
    if (/^tel:/i.test(value)) return approvedPhones.has(canonicalPhone(decodeURIComponent(value.slice(4))) ?? "");
    if (/^mailto:/i.test(value)) return approvedEmails.has(decodeURIComponent(value.slice(7)).toLowerCase());
    const absolute = /^(?:www\.|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|$))/i.test(value) ? "https://" + value : value;
    const url = new URL(absolute, PLATFORM_CONTACTS.website);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    if (approvedHosts.has(url.hostname.toLowerCase())) return true;
    return url.href === PLATFORM_CONTACTS.telegram;
  } catch { return false; }
}

/** Check contact-shaped output only: course counts, dates and legal references are not phone numbers. */
export function hasUnapprovedSupportContact(text: string): boolean {
  for (const email of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) {
    if (!approvedEmails.has(email.toLowerCase())) return true;
  }
  const phones: string[] = text.match(/(?<![\p{L}\p{N}])(?:\+7|8|7)(?:[\s().\-\u00a0\u2010-\u2015]*\d){10}(?![\p{L}\p{N}])|\+(?:[\s().\-\u00a0\u2010-\u2015]*\d){8,15}(?!\d)/gu) ?? [];
  phones.push(...(text.match(/\(\d{3}\)[\s.\-]*\d{3}[\s.\-]*\d{2}[\s.\-]*\d{2}(?!\d)/g) ?? []));
  for (const match of text.matchAll(/(?:телефон|тел\.|мобильный|номер телефона)\s*[:—-]?\s*(\d(?:[\s().\-]*\d){6,14})(?!\d)/giu)) phones.push(match[1]);
  if (phones.some(phone => !approvedPhones.has(canonicalPhone(phone) ?? ""))) return true;
  const contactFraming = /контакты|связаться|напишите|звоните|позвоните|(?:телефон|почта|email|e-mail)\s*:|сайт поддержки/iu.test(text);
  const contactChannel = /^(?:tel:|mailto:|tg:|whatsapp:)|(?:^|\/\/)(?:www\.)?(?:t\.me|telegram\.me|wa\.me|api\.whatsapp\.com)(?:\/|$)/i;
  const links: string[] = text.match(/(?:https?:\/\/|www\.|(?:tel|mailto|tg|whatsapp):)[^\s<>"')\]]+/gi) ?? [];
  for (const match of text.matchAll(/\]\(([^\s)]+)\)/g)) links.push(match[1]);
  links.push(...(text.match(/(?<![\w@])(?:t\.me|telegram\.me|wa\.me)\/[^\s<>"')\]]+/gi) ?? []));
  if (links.some(link => (contactFraming || contactChannel.test(link)) && !approvedLink(link))) return true;
  for (const match of text.matchAll(/\[([^\]]+)\]\((tel:[^)]+)\)/gi)) {
    const labelPhone = canonicalPhone(match[1]);
    if (labelPhone && labelPhone !== canonicalPhone(match[2].slice(4))) return true;
  }
  // Bare messenger handles are not any of the published contact channels.
  return /(?:^|[\s(])@[A-Z0-9_]{3,64}\b/i.test(text);
}

export function guardSupportContactAnswer(text: string): string {
  return hasUnapprovedSupportContact(text)
    ? officialSupportContactReply("Официальные контакты платформы")!
    : text;
}

export interface SupportHistoryMessage { id: string; role: string; content: string }

/** Input is the server's newest-first bounded query; current user input is always last, exactly once. */
export function supportMessagesFromLatest(history: readonly SupportHistoryMessage[], currentId: string, currentText: string) {
  return [
    ...history.filter(row => row.id !== currentId && (row.role === "user" || row.role === "ai"))
      .slice(0, 19).reverse().map(row => ({ role: row.role === "ai" ? "assistant" : "user", content: row.content })),
    { role: "user", content: currentText },
  ];
}
