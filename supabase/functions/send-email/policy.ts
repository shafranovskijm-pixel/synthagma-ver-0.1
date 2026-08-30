export const SEND_EMAIL_LIMITS = {
  requestBytes: 2 * 1024 * 1024,
  recipientBytes: 320,
  subjectBytes: 512,
  htmlBytes: 1_900_000,
  fromBytes: 512,
} as const;

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export type SendEmailCaller =
  | { kind: "service_role" }
  | { kind: "admin"; userId: string };

export type SendEmailAuthResult =
  | { ok: true; caller: SendEmailCaller }
  | { ok: false; status: 401 | 403; error: "unauthorized" | "forbidden" };

export interface SendEmailAuthDeps {
  serviceRoleKey: string;
  getVerifiedUser: (accessToken: string) => Promise<{ id: string } | null>;
  hasAdminRole: (userId: string) => Promise<boolean>;
}

export class SendEmailInputError extends Error {
  constructor(
    public readonly code:
      | "payload_too_large"
      | "invalid_json"
      | "invalid_payload"
      | "invalid_recipient"
      | "invalid_subject"
      | "invalid_html"
      | "invalid_sender",
    message: string,
    public readonly status: 400 | 413 = 400,
  ) {
    super(message);
  }
}

const encoder = new TextEncoder();

function utf8Bytes(value: string): number {
  return encoder.encode(value).byteLength;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasHeaderControls(value: string): boolean {
  return /[\r\n\u0000]/.test(value);
}

function isMailbox(value: string): boolean {
  return utf8Bytes(value) <= SEND_EMAIL_LIMITS.recipientBytes &&
    !hasHeaderControls(value) &&
    /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(value);
}

/** Extracts and normalizes the mailbox from either `a@b.tld` or `Name <a@b.tld>`. */
export function extractFromMailbox(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || hasHeaderControls(trimmed)) return null;

  const bracketed = trimmed.match(/^([^<>]*)<([^<>]+)>$/);
  const mailbox = bracketed ? bracketed[2].trim() : trimmed;
  if (!isMailbox(mailbox)) return null;
  return mailbox.toLowerCase();
}

export function parseEmailPayload(rawText: string): EmailPayload {
  if (utf8Bytes(rawText) > SEND_EMAIL_LIMITS.requestBytes) {
    throw new SendEmailInputError("payload_too_large", "Request body is too large", 413);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw new SendEmailInputError("invalid_json", "Request body must be valid JSON");
  }
  if (!isPlainObject(raw)) {
    throw new SendEmailInputError("invalid_payload", "Request body must be an object");
  }

  const to = typeof raw.to === "string" ? raw.to.trim() : "";
  const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
  const html = typeof raw.html === "string" ? raw.html : "";
  const hasFrom = Object.prototype.hasOwnProperty.call(raw, "from");
  if (hasFrom && typeof raw.from !== "string") {
    throw new SendEmailInputError("invalid_sender", "Sender is invalid");
  }
  const from = typeof raw.from === "string" ? raw.from.trim() : undefined;

  if (!isMailbox(to)) {
    throw new SendEmailInputError("invalid_recipient", "Recipient must be one valid email address");
  }
  if (!subject || hasHeaderControls(subject) || utf8Bytes(subject) > SEND_EMAIL_LIMITS.subjectBytes) {
    throw new SendEmailInputError("invalid_subject", "Subject is missing or too long");
  }
  if (!html || utf8Bytes(html) > SEND_EMAIL_LIMITS.htmlBytes) {
    throw new SendEmailInputError("invalid_html", "HTML body is missing or too large");
  }
  if (from !== undefined && (
    utf8Bytes(from) > SEND_EMAIL_LIMITS.fromBytes || extractFromMailbox(from) === null
  )) {
    throw new SendEmailInputError("invalid_sender", "Sender is invalid");
  }

  return { to, subject, html, ...(from === undefined ? {} : { from }) };
}

function bearerToken(req: Request): string | null {
  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Authorizes service-to-service calls by exact service-role token equality.
 * For every other token, the user is verified before the admin-role lookup is run.
 */
export async function authorizeSendEmail(
  req: Request,
  deps: SendEmailAuthDeps,
): Promise<SendEmailAuthResult> {
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: "unauthorized" };

  if (deps.serviceRoleKey && token === deps.serviceRoleKey) {
    return { ok: true, caller: { kind: "service_role" } };
  }

  const user = await deps.getVerifiedUser(token);
  if (!user) return { ok: false, status: 401, error: "unauthorized" };

  const isAdmin = await deps.hasAdminRole(user.id);
  if (!isAdmin) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, caller: { kind: "admin", userId: user.id } };
}

export function isAllowedConfiguredSender(
  mailbox: string,
  configuredPlatformFrom: string | null,
  activePoolEmails: readonly string[],
): boolean {
  const normalized = mailbox.trim().toLowerCase();
  const platformMailbox = configuredPlatformFrom
    ? extractFromMailbox(configuredPlatformFrom)
    : null;
  if (platformMailbox === normalized) return true;
  return activePoolEmails.some((email) => email.trim().toLowerCase() === normalized);
}
