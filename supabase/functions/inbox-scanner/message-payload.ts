import type { parseRfc822 } from "../_shared/imap-mini.ts";

/** Header IDs only: never infer attribution from subject or matching address. */
export function messageIds(header: string | null | undefined): string[] {
  return [...new Set((header || "").match(/<[^<>\s\x00-\x1f\x7f]+@[^<>\s\x00-\x1f\x7f]+>/g) || [])];
}

export function inboxMessagePayload(raw: string, inboxEmail: string, parse: typeof parseRfc822, partialFetch = false) {
  const parsed = parse(raw);
  const headerEnd = raw.search(/\r?\n\r?\n/);
  if (headerEnd < 0) throw new Error("Incomplete RFC822 headers");
  const headers = raw.slice(0, headerEnd);
  const remote = parsed.from_email.toLowerCase();
  const ignoredReason = /^X-Warmup-Id\s*:/im.test(headers) ? "warmup"
    : /(^mailer-daemon@|^postmaster@)/i.test(remote) ? "bounce"
    : remote === inboxEmail.toLowerCase() ? "self"
    : !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(remote) ? "invalid_sender" : null;
  const replyIds = messageIds(parsed.in_reply_to);
  const allRefs = [...new Set([...messageIds(parsed.references_ids), ...replyIds])];
  const attributionLimited = allRefs.length > 100 || allRefs.some(id => id.length > 512);
  const truncated = partialFetch || parsed.body_text.length > 60000 || parsed.body_html.length > 200000;
  const note = truncated ? "\n\n[Письмо показано частично: большой объём или вложения. Полный оригинал находится в почтовом ящике.]" : "";
  const htmlNote = truncated ? `<p>${note.trim()}</p>` : "";
  return {
    from_email: remote, from_name: parsed.from_name?.slice(0, 300) || null,
    // IMAP mailbox is the verified delivery destination. Header To may be an
    // alias/list/other BCC recipient; retain that untrusted header separately.
    to_email: inboxEmail, subject: parsed.subject.slice(0, 2000),
    body_text: parsed.body_text.slice(0, 60000 - note.length) + note,
    body_html: parsed.body_html.slice(0, 200000 - htmlNote.length) + htmlNote,
    message_id: messageIds(parsed.message_id).find(id => id.length <= 512) || null,
    in_reply_to: attributionLimited ? null : (replyIds[0] || null),
    references_ids: attributionLimited ? [] : allRefs,
    headers_raw: headers.slice(0, 64000), received_at: parsed.received_at.toISOString(),
    body_truncated: truncated, attribution_limited: attributionLimited,
    ignored_reason: ignoredReason,
  };
}
