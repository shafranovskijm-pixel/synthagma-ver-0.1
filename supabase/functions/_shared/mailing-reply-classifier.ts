export type MailingReplyClassification =
  | "interested"
  | "not_interested"
  | "unsubscribe"
  | "auto_reply"
  | "needs_review";

export interface MailingReplyClassificationResult {
  classification: MailingReplyClassification;
  interestHours: 50 | 150 | 250 | null;
  directText: string;
}

/**
 * Keeps only the newly written part of a reply. Quoted history is deliberately
 * excluded so the operator sees the answer, not a copy of the original mailing.
 */
export function extractLatestReplyText(value: string): string {
  const normalized = String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!normalized) return "";

  const kept: string[] = [];
  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (/^>/.test(trimmed)) break;
    if (/^(?:-{2,}\s*)?(?:original message|исходное сообщение)\s*(?:-{2,})?$/iu.test(trimmed)) break;
    if (/^(?:on .+ wrote:|.+ написал(?:а)?:)$/iu.test(trimmed)) break;
    if (/^(?:from|от):\s+.+@/iu.test(trimmed) && kept.length > 0) break;
    if (/^--\s*$/.test(trimmed) && kept.length > 0) break;
    kept.push(line);
    if (kept.join("\n").length >= 12_000) break;
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 12_000);
}

export function classifyMailingReply(input: {
  subject?: string | null;
  bodyText?: string | null;
  rawHeaders?: string | null;
}): MailingReplyClassificationResult {
  const directText = extractLatestReplyText(input.bodyText || "");
  const subject = String(input.subject || "").trim();
  const rawHeaders = String(input.rawHeaders || "");
  const haystack = `${subject}\n${directText}`.toLocaleLowerCase("ru-RU");

  const isAutoReply =
    /^auto-submitted:\s*(?!no\b)\S+/imu.test(rawHeaders) ||
    /^(?:x-autoreply|x-autorespond|x-auto-response-suppress):/imu.test(rawHeaders) ||
    /\b(?:автоответ|автоматическ(?:ий|ое)\s+(?:ответ|уведомление)|out of office|automatic reply|away from office)\b/iu.test(subject);
  if (isAutoReply) {
    return { classification: "auto_reply", interestHours: null, directText };
  }

  const unsubscribe = /(?:отпиш\w*|не\s+пиш\w*|не\s+присыла\w*|уберите\s+(?:меня|наш\w*|адрес)|удалите\s+(?:меня|наш\w*|адрес)|не\s*актуальн\w*|\bstop\b|\bunsubscribe\b)/iu;
  if (unsubscribe.test(haystack)) {
    return { classification: "unsubscribe", interestHours: null, directText };
  }

  const negative = /(?:не\s+интерес\w*|не\s+нуж\w*|нет[\s,!.-]+спасибо|не\s+рассматрива\w*|отказыва\w*)/iu;
  if (negative.test(haystack)) {
    return { classification: "not_interested", interestHours: null, directText };
  }

  const hours = [...haystack.matchAll(/\b(50|150|250)\s*(?:ч(?:ас(?:а|ов)?)?\.?\b)?/giu)]
    .map((match) => Number(match[1]) as 50 | 150 | 250);
  const uniqueHours = [...new Set(hours)];
  const interestHours = uniqueHours.length === 1 ? uniqueHours[0] : null;
  // The campaign asks recipients to reply with the single word "программа".
  // Match it only in newly written text so a subject cannot classify all replies.
  const explicitProgramRequest = /^\s*программ(?:а|у)\s*[.!?]*\s*$/iu.test(directText);
  const interested = /(?:интерес\w*|подход\w*|пришл\w*|отправ\w*\s+(?:кп|предложение|информацию)|подробн\w*|стоимост\w*|цен\w*|готов\w*|хотим|хочу|запиш\w*|обучени\w*|(?:^|\s)да[,.!\s]|свяж\w*)/iu;
  if (explicitProgramRequest || uniqueHours.length > 0 || interested.test(haystack)) {
    return { classification: "interested", interestHours, directText };
  }

  return { classification: "needs_review", interestHours: null, directText };
}
