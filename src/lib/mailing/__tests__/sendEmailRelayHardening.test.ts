import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  authorizeSendEmail,
  extractFromMailbox,
  isAllowedConfiguredSender,
  parseEmailPayload,
  SEND_EMAIL_LIMITS,
  type SendEmailAuthResult,
} from "../../../../supabase/functions/send-email/policy";
import { createSendEmailHandler } from "../../../../supabase/functions/send-email/handler";

const ROOT = resolve(__dirname, "../../../..");
const SEND_EMAIL_INDEX = readFileSync(
  resolve(ROOT, "supabase/functions/send-email/index.ts"),
  "utf8",
);
const SUPABASE_CONFIG = readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8");

function request(token?: string, body: Record<string, unknown> = {
  to: "recipient@example.com",
  subject: "Subject",
  html: "<p>Hello</p>",
}): Request {
  return new Request("https://example.test/functions/v1/send-email", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(body),
  });
}

describe("send-email authorization matrix", () => {
  it("accepts an exact service-role token without user/admin lookups", async () => {
    const getVerifiedUser = vi.fn();
    const hasAdminRole = vi.fn();
    const result = await authorizeSendEmail(request("service-key"), {
      serviceRoleKey: "service-key",
      getVerifiedUser,
      hasAdminRole,
    });

    expect(result).toEqual({ ok: true, caller: { kind: "service_role" } });
    expect(getVerifiedUser).not.toHaveBeenCalled();
    expect(hasAdminRole).not.toHaveBeenCalled();
  });

  it("denies anonymous and unverifiable callers before any admin lookup", async () => {
    const getVerifiedUser = vi.fn().mockResolvedValue(null);
    const hasAdminRole = vi.fn();

    await expect(authorizeSendEmail(request(), {
      serviceRoleKey: "service-key",
      getVerifiedUser,
      hasAdminRole,
    })).resolves.toEqual({ ok: false, status: 401, error: "unauthorized" });
    expect(getVerifiedUser).not.toHaveBeenCalled();

    await expect(authorizeSendEmail(request("bad-user-token"), {
      serviceRoleKey: "service-key",
      getVerifiedUser,
      hasAdminRole,
    })).resolves.toEqual({ ok: false, status: 401, error: "unauthorized" });
    expect(getVerifiedUser).toHaveBeenCalledOnce();
    expect(hasAdminRole).not.toHaveBeenCalled();
  });

  it("verifies auth.getUser before checking role, then permits only admin", async () => {
    const calls: string[] = [];
    const getVerifiedUser = vi.fn(async () => {
      calls.push("getUser");
      return { id: "user-id" };
    });
    const hasAdminRole = vi.fn(async () => {
      calls.push("adminLookup");
      return true;
    });

    await expect(authorizeSendEmail(request("user-token"), {
      serviceRoleKey: "service-key",
      getVerifiedUser,
      hasAdminRole,
    })).resolves.toEqual({ ok: true, caller: { kind: "admin", userId: "user-id" } });
    expect(calls).toEqual(["getUser", "adminLookup"]);

    hasAdminRole.mockResolvedValueOnce(false);
    await expect(authorizeSendEmail(request("user-token"), {
      serviceRoleKey: "service-key",
      getVerifiedUser,
      hasAdminRole,
    })).resolves.toEqual({ ok: false, status: 403, error: "forbidden" });
  });
});

describe("send-email payload policy", () => {
  it("accepts the existing payload shape and normalizes fields", () => {
    expect(parseEmailPayload(JSON.stringify({
      to: " recipient@example.com ",
      subject: " Subject ",
      html: "<p>Hello</p>",
      from: "Sintagma <SUPPORT@example.com>",
    }))).toEqual({
      to: "recipient@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      from: "Sintagma <SUPPORT@example.com>",
    });
    expect(extractFromMailbox("Sintagma <SUPPORT@example.com>")).toBe("support@example.com");
  });

  it("rejects invalid JSON, arrays, header injection, and invalid addresses", () => {
    expect(() => parseEmailPayload("{"))
      .toThrowError(expect.objectContaining({ code: "invalid_json" }));
    expect(() => parseEmailPayload("[]"))
      .toThrowError(expect.objectContaining({ code: "invalid_payload" }));
    expect(() => parseEmailPayload(JSON.stringify({
      to: "a@example.com\r\nBcc: b@example.com",
      subject: "Subject",
      html: "x",
    }))).toThrowError(expect.objectContaining({ code: "invalid_recipient" }));
    expect(() => parseEmailPayload(JSON.stringify({
      to: "a@example.com",
      subject: "Subject\r\nBcc: b@example.com",
      html: "x",
    }))).toThrowError(expect.objectContaining({ code: "invalid_subject" }));
    expect(() => parseEmailPayload(JSON.stringify({
      to: "a@example.com",
      subject: "Subject",
      html: "x",
      from: "Name <not-an-email>",
    }))).toThrowError(expect.objectContaining({ code: "invalid_sender" }));
    expect(() => parseEmailPayload(JSON.stringify({
      to: "a@example.com",
      subject: "Subject",
      html: "x",
      from: null,
    }))).toThrowError(expect.objectContaining({ code: "invalid_sender" }));
  });

  it("enforces UTF-8 request, subject, HTML, and From caps", () => {
    const oversizedRequest = "я".repeat(SEND_EMAIL_LIMITS.requestBytes);
    expect(() => parseEmailPayload(oversizedRequest)).toThrowError(
      expect.objectContaining({ code: "payload_too_large", status: 413 }),
    );

    expect(() => parseEmailPayload(JSON.stringify({
      to: "a@example.com",
      subject: "я".repeat(SEND_EMAIL_LIMITS.subjectBytes),
      html: "x",
    }))).toThrowError(expect.objectContaining({ code: "invalid_subject" }));

    expect(() => parseEmailPayload(JSON.stringify({
      to: "a@example.com",
      subject: "Subject",
      html: "x".repeat(SEND_EMAIL_LIMITS.htmlBytes + 1),
    }))).toThrowError(expect.objectContaining({ code: "invalid_html" }));

    expect(() => parseEmailPayload(JSON.stringify({
      to: "a@example.com",
      subject: "Subject",
      html: "x",
      from: `${"N".repeat(SEND_EMAIL_LIMITS.fromBytes)} <a@example.com>`,
    }))).toThrowError(expect.objectContaining({ code: "invalid_sender" }));
  });
});

describe("send-email handler", () => {
  const admin: SendEmailAuthResult = { ok: true, caller: { kind: "admin", userId: "admin-id" } };
  const service: SendEmailAuthResult = { ok: true, caller: { kind: "service_role" } };

  it("is POST-only (with CORS preflight) and denies unauthenticated callers", async () => {
    const authorize = vi.fn().mockResolvedValue({ ok: false, status: 401, error: "unauthorized" });
    const send = vi.fn();
    const handler = createSendEmailHandler({
      authorize,
      isAdminSenderAllowed: vi.fn(),
      send,
    });

    expect((await handler(new Request("https://example.test", { method: "GET" }))).status).toBe(405);
    expect((await handler(new Request("https://example.test", { method: "OPTIONS" }))).status).toBe(200);
    expect((await handler(request())).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("restricts admin fromOverride to an active configured sender", async () => {
    const isAdminSenderAllowed = vi.fn().mockResolvedValue(false);
    const send = vi.fn().mockResolvedValue({ ok: true });
    const handler = createSendEmailHandler({
      authorize: vi.fn().mockResolvedValue(admin),
      isAdminSenderAllowed,
      send,
    });

    const denied = await handler(request("admin-token", {
      to: "recipient@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      from: "Unknown <unknown@example.com>",
    }));
    expect(denied.status).toBe(403);
    expect(isAdminSenderAllowed).toHaveBeenCalledWith("unknown@example.com");
    expect(send).not.toHaveBeenCalled();

    isAdminSenderAllowed.mockResolvedValueOnce(true);
    const allowed = await handler(request("admin-token", {
      to: "recipient@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      from: "Allowed <allowed@example.com>",
    }));
    expect(allowed.status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
  });

  it("preserves trusted service-role fromOverride and student.local skip", async () => {
    const isAdminSenderAllowed = vi.fn();
    const send = vi.fn().mockResolvedValue({ ok: true });
    const handler = createSendEmailHandler({
      authorize: vi.fn().mockResolvedValue(service),
      isAdminSenderAllowed,
      send,
    });

    expect((await handler(request("service-key", {
      to: "recipient@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      from: "Organization <noreply@example.com>",
    }))).status).toBe(200);
    expect(isAdminSenderAllowed).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();

    send.mockClear();
    const skipped = await handler(request("service-key", {
      to: "student@student.local",
      subject: "Subject",
      html: "<p>Hello</p>",
    }));
    expect(skipped.status).toBe(200);
    expect(await skipped.json()).toEqual({ success: true, skipped: "no_real_email" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects declared oversized bodies before auth and keeps delivery errors generic", async () => {
    const authorize = vi.fn().mockResolvedValue(service);
    const handler = createSendEmailHandler({
      authorize,
      isAdminSenderAllowed: vi.fn(),
      send: vi.fn().mockResolvedValue({ ok: false, error: "internal SMTP detail" }),
    });
    const oversized = request("service-key");
    oversized.headers.set("Content-Length", String(SEND_EMAIL_LIMITS.requestBytes + 1));
    expect((await handler(oversized)).status).toBe(413);
    expect(authorize).not.toHaveBeenCalled();

    const response = await handler(request("service-key"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "email_delivery_failed" });
  });
});

describe("configured sender policy and deployment contract", () => {
  it("allows only SMTP_FROM or an active pool mailbox", () => {
    expect(isAllowedConfiguredSender(
      "support@example.com",
      "Sintagma <support@example.com>",
      [],
    )).toBe(true);
    expect(isAllowedConfiguredSender(
      "pool@example.com",
      null,
      ["POOL@example.com"],
    )).toBe(true);
    expect(isAllowedConfiguredSender("forged@example.com", null, ["pool@example.com"]))
      .toBe(false);
  });

  it("enables gateway JWT and keeps auth.getUser before service-role admin lookup", () => {
    expect(SUPABASE_CONFIG).toMatch(/\[functions\.send-email\]\s*verify_jwt\s*=\s*true/);
    const getUserIndex = SEND_EMAIL_INDEX.indexOf("auth.getUser(accessToken)");
    const adminLookupIndex = SEND_EMAIL_INDEX.indexOf('from("user_roles")');
    expect(getUserIndex).toBeGreaterThan(-1);
    expect(adminLookupIndex).toBeGreaterThan(getUserIndex);
    expect(SEND_EMAIL_INDEX).toMatch(/from\("email_sender_pool"\)[\s\S]{0,180}eq\("is_active", true\)/);
    expect(SEND_EMAIL_INDEX).toMatch(/not\("app_password", "is", null\)/);
    expect(SEND_EMAIL_INDEX).toMatch(/neq\("app_password", ""\)/);
    expect(SEND_EMAIL_INDEX).not.toMatch(/select\("\*"\)/);
  });

  it("keeps all three browser-admin callers and four service-role Edge callers wired", () => {
    const browserCallers = [
      "src/components/admin/AdminDocumentsManager.tsx",
      "src/components/admin/BroadcastManager.tsx",
      "src/components/admin/sales/CommercialProposals.tsx",
    ];
    for (const path of browserCallers) {
      expect(readFileSync(resolve(ROOT, path), "utf8")).toMatch(/invoke\(["']send-email["']/);
    }

    const serviceCallers = [
      "supabase/functions/process-invoice-payment-reminders/index.ts",
      "supabase/functions/send-lead-magnet/index.ts",
      "supabase/functions/submit-demo-request/index.ts",
      "supabase/functions/webinar-reminders-cron/index.ts",
    ];
    for (const path of serviceCallers) {
      const source = readFileSync(resolve(ROOT, path), "utf8");
      expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source).toMatch(/invoke\(\s*["']send-email["']/);
    }
  });
});

function filesBelow(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) return filesBelow(full);
    return /\.(?:ts|tsx|js|mjs|sql|json|toml)$/i.test(entry.name) ? [full] : [];
  });
}

describe("retired SMTP account cleanup", () => {
  const retiredSeed = readFileSync(
    resolve(ROOT, "supabase/migrations/20260703011059_afc45248-dca5-452e-b8fe-d8ff154bd519.sql"),
    "utf8",
  );
  const forward = readFileSync(
    resolve(ROOT, "supabase/migrations/20260830160000_remove_retired_sender_domain.sql"),
    "utf8",
  );
  const autocheck = readFileSync(
    resolve(ROOT, "supabase/functions/autocheck-sender-pool/index.ts"),
    "utf8",
  );
  const senderInboxes = readFileSync(
    resolve(ROOT, "src/components/admin/broadcast/SenderInboxesTable.tsx"),
    "utf8",
  );

  it("removes account records and credentials from the historical seed in the current tree", () => {
    expect(retiredSeed).not.toMatch(/app_password|UPDATE\s+public\.email_sender_pool/i);
    expect(retiredSeed).not.toMatch(/yi\.mannni\.com/i);

    const scannedFiles = [
      ...filesBelow(resolve(ROOT, "supabase/functions")),
      ...filesBelow(resolve(ROOT, "supabase/migrations")),
      ...filesBelow(resolve(ROOT, "src/components/admin")),
    ];
    const riskyDomainSecretLines = scannedFiles.flatMap((file) =>
      readFileSync(file, "utf8").split(/\r?\n/).filter((line) =>
        /yi\.mannni\.com/i.test(line) &&
        /(app_password|password_encrypted|smtp_pass|password\s*=)/i.test(line)
      ),
    );
    expect(riskyDomainSecretLines).toEqual([]);
  }, 15_000);

  it("fails atomically before exact-domain DELETE when any dependent history exists", () => {
    const deleteIndex = forward.indexOf("DELETE FROM public.email_sender_pool");
    expect(forward).toMatch(/^DO \$\$/m);
    expect(forward).toContain("email_warmup_pings");
    expect(forward).toContain("email_conversations");
    expect(forward).toContain("email_messages");
    expect(forward.indexOf("RAISE EXCEPTION")).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(forward.indexOf("RAISE EXCEPTION"));
    expect(forward.match(/DELETE FROM public\.email_sender_pool/g)).toHaveLength(1);
  });

  it("uses equality on the normalized exact domain and no wildcard predicate", () => {
    expect(forward).toMatch(
      /lower\(split_part\(btrim\(s\.email\), '@', 2\)\) = 'yi\.mannni\.com'/,
    );
    expect(forward).not.toMatch(/\b(?:LIKE|ILIKE)\b/i);
    expect(forward).not.toMatch(/DELETE\s+FROM\s+public\.email_warmup_pings|DELETE\s+FROM\s+public\.email_conversations|DELETE\s+FROM\s+public\.email_messages/i);
  });

  it("keeps the retired domain out of the sender UI and SMTP autocheck", () => {
    expect(senderInboxes).not.toMatch(/yi\.mannni\.com/i);
    expect(senderInboxes).toContain('placeholder="name@gmail.com"');
    expect(autocheck).not.toMatch(/yi\.mannni\.com|\.like\(/i);
    expect(autocheck).toMatch(/from\("email_sender_pool"\)[\s\S]{0,180}select\("id,email,app_password,host,port,encryption,from_name"\)/);
  });
});
