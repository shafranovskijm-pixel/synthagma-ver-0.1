import {
  extractFromMailbox,
  parseEmailPayload,
  SEND_EMAIL_LIMITS,
  SendEmailInputError,
  type EmailPayload,
  type SendEmailAuthResult,
} from "./policy.ts";

export interface EmailSendResult {
  ok: boolean;
  error?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
}

export interface SendEmailHandlerDeps {
  authorize: (req: Request) => Promise<SendEmailAuthResult>;
  isAdminSenderAllowed: (mailbox: string) => Promise<boolean>;
  send: (payload: EmailPayload) => Promise<EmailSendResult>;
  reportError?: (error: unknown) => void;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status: number, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

export function createSendEmailHandler(deps: SendEmailHandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const declaredLength = Number(req.headers.get("Content-Length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > SEND_EMAIL_LIMITS.requestBytes) {
      return json({ error: "payload_too_large" }, 413);
    }

    try {
      const auth = await deps.authorize(req);
      if (auth.ok === false) return json({ error: auth.error }, auth.status);

      const payload = parseEmailPayload(await req.text());

      // Service-role callers are existing trusted Edge paths and keep the
      // previous fromOverride behavior. Browser admins are restricted to a
      // configured platform sender so they cannot forge arbitrary From headers.
      if (auth.caller.kind === "admin" && payload.from) {
        const mailbox = extractFromMailbox(payload.from);
        if (!mailbox || !(await deps.isAdminSenderAllowed(mailbox))) {
          return json({ error: "sender_not_allowed" }, 403);
        }
      }

      if (payload.to.toLowerCase().endsWith("@student.local")) {
        return json({ success: true, skipped: "no_real_email" }, 200);
      }

      const result = await deps.send(payload);
      if (!result.ok) {
        if (result.rateLimited) {
          const retryAfter = Math.max(1, Math.floor(result.retryAfterSeconds || 60));
          return json(
            { error: "rate_limited", retryAfterSeconds: retryAfter },
            429,
            { "Retry-After": String(retryAfter) },
          );
        }
        return json({ error: "email_delivery_failed" }, 502);
      }

      return json({ success: true }, 200);
    } catch (error: unknown) {
      if (error instanceof SendEmailInputError) {
        return json({ error: error.code }, error.status);
      }
      deps.reportError?.(error);
      return json({ error: "internal_error" }, 500);
    }
  };
}
