import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DELIVERABILITY_SEED_PRESETS,
  emptyDeliverabilitySeedDraft,
  providerForEmail,
  toDeliverabilitySeedRow,
  validateDeliverabilitySeedDraft,
} from "@/lib/mailing/deliverabilityPresets";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260809113034_f4fd9d28-221b-4594-a3b0-010b43171b1a.sql");
const worker = read("supabase/functions/mailing-deliverability-worker/index.ts");
const seedTest = read("supabase/functions/mailing-deliverability-seed-test/index.ts");
const imap = read("supabase/functions/_shared/imap-mini.ts");

describe("deliverability seed presets", () => {
  it("contain no credentials", () => {
    for (const preset of DELIVERABILITY_SEED_PRESETS) {
      expect(Object.keys(preset).join(" ")).not.toMatch(/password|secret|token|credential/i);
    }
  });

  it("recognizes the four MVP provider categories", () => {
    expect(providerForEmail("control@gmail.com")).toBe("gmail");
    expect(providerForEmail("control@ya.ru")).toBe("yandex");
    expect(providerForEmail("control@mail.ru")).toBe("mailru");
    expect(providerForEmail("control@example.org")).toBe("custom");
  });

  it("requires an app password and sends it only in the encrypted input field", () => {
    const draft = {
      ...emptyDeliverabilitySeedDraft(),
      email: "control@gmail.com",
      imapUsername: "control@gmail.com",
      appPassword: "one-time-app-password",
    };
    expect(validateDeliverabilitySeedDraft(draft).ok).toBe(true);
    const row = toDeliverabilitySeedRow(draft, "org-id");
    expect(row.secret_encrypted).toBe("one-time-app-password");
    expect(row).not.toHaveProperty("password");
  });
});

describe("deliverability database security", () => {
  it("isolates seed inboxes and checks by organization", () => {
    expect(migration).toContain("mailing_deliverability_seeds ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("mailing_deliverability_checks ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("public.can_access_organization(organization_id, 'email.manage')");
  });

  it("excludes the encrypted seed secret from client SELECT grants", () => {
    const start = migration.indexOf("GRANT SELECT (", migration.indexOf("mailing_deliverability_seeds"));
    const end = migration.indexOf(") ON public.mailing_deliverability_seeds", start);
    expect(start).toBeGreaterThan(-1);
    expect(migration.slice(start, end)).not.toContain("secret_encrypted");
  });

  it("encrypts seed secrets and exposes decryption only to service_role", () => {
    expect(migration).toContain("encrypt_password(NEW.secret_encrypted)");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_mailing_deliverability_seed_secret(uuid) FROM authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_mailing_deliverability_seed_secret(uuid) TO service_role",
    );
  });

  it("hard-caps the MVP at ten probes per sender per day", () => {
    expect(migration).toContain("warmup_daily_target BETWEEN 1 AND 10");
    expect(migration).toContain("slot_index BETWEEN 1 AND 10");
    expect(worker).toContain("MVP_DAILY_CAP = 10");
  });
});

describe("deliverability worker boundaries", () => {
  it("uses the encrypted organization sender path, not the legacy global pool", () => {
    expect(worker).toContain('.from("mailing_senders")');
    expect(worker).toContain("get_mailing_sender_secret");
    expect(worker).not.toContain("email_sender_pool");
  });

  it("requires a long cron secret or an authorized organization user", () => {
    expect(worker).toContain("expectedCronSecret.length >= 24");
    expect(worker).toContain("can_access_organization");
    expect(worker).toContain('return json({ error: "Unauthorized" }, 401)');
    expect(worker).toContain('return json({ error: "Forbidden" }, 403)');
    expect(worker).toContain('pendingQuery.eq("sender_id", requestedSenderId)');
  });

  it("uses read-only placement checks and never implements fake engagement", () => {
    expect(worker).toContain("placementForReadOnly");
    expect(worker).not.toMatch(/UID MOVE|UID STORE|\\Seen|EXPUNGE|reply/i);
    const readOnlyStart = imap.indexOf("export async function placementForReadOnly");
    const destructiveStart = imap.indexOf("export async function placementFor(", readOnlyStart);
    const readOnlyBlock = imap.slice(readOnlyStart, destructiveStart);
    expect(readOnlyBlock).toContain("examineFolder");
    expect(readOnlyBlock).not.toMatch(/selectFolder|UID MOVE|UID STORE|\\Seen|EXPUNGE/);
  });

  it("never logs secrets and the seed test only logs in and out", () => {
    expect(worker).not.toMatch(/console\.(log|info|warn|error)/);
    expect(seedTest).not.toMatch(/SEARCH|FETCH|SELECT|UID STORE|UID MOVE/);
    expect(seedTest).toContain("connectImap");
    expect(seedTest).toContain("closeImap");
  });

  it("decrypts a seed secret only after tenant authorization", () => {
    const authorizationGate = seedTest.indexOf('if (!allowed) return json({ error: "Forbidden" }, 403)');
    const decryptCall = seedTest.indexOf('"get_mailing_deliverability_seed_secret"');
    expect(authorizationGate).toBeGreaterThan(-1);
    expect(decryptCall).toBeGreaterThan(authorizationGate);
  });
});
