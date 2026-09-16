import type { SmtpConfig } from "../_shared/smtp-sender.ts";
import { assertEnvelopeAddress, assertNoCrlf, ensureFullHtmlDocument, htmlToPlainText } from "../_shared/smtp-protocol.ts";

export type OrdinarySenderKind = "pool" | "mailing" | "platform_env" | "org_legacy";

/** Facts match the values handed to SMTP; they are not evidence of delivery. */
export function ordinaryMessageFacts(input: {
  smtp: SmtpConfig; fromName?: string | null; replyTo?: string | null;
  senderKind: OrdinarySenderKind; senderPoolId?: string | null; mailingSenderId?: string | null;
  messageId: string; subject: string; html: string;
}) {
  const fromEmail = assertEnvelopeAddress(input.smtp.from_email, "From");
  const fromName = (input.fromName || input.smtp.from_name || "").trim();
  // Never let a display name inject the first <address> parsed by SMTP.
  if (/[<>\x00-\x1f\x7f]/.test(fromName)) throw new Error("Invalid sender display name");
  const replyTo = input.replyTo ? assertEnvelopeAddress(input.replyTo, "Reply-To") : null;
  if (input.senderKind === "pool" && replyTo && replyTo.toLowerCase() !== fromEmail.toLowerCase()) {
    throw new Error("Selected inbox cannot track a different Reply-To");
  }
  const subject = assertNoCrlf(input.subject, "Subject");
  const html = ensureFullHtmlDocument(input.html, subject);
  const text = htmlToPlainText(html);
  // Do not truncate stored facts but send a different, longer original body.
  if (html.length > 200000 || text.length > 60000) throw new Error("Ordinary message exceeds history limits");
  return Object.freeze({
    smtp_message_id: assertNoCrlf(input.messageId, "Message-ID"),
    from_email: fromEmail, from_name: fromName || null, reply_to: replyTo,
    sender_kind: input.senderKind, sender_pool_id: input.senderPoolId || null,
    mailing_sender_id: input.mailingSenderId || null,
    subject, html_body: html, text_body: text,
  });
}
