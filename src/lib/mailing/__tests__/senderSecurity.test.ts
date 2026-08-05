import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const testFn = read("supabase/functions/mailing-sender-test/index.ts");
const seedFn = read("supabase/functions/mailing-seed-send/index.ts");
const migration = read(
  "supabase/migrations/20260805075850_f00c352f-c398-46ee-907a-1e62265ec0d7.sql",
);

describe("mailing-sender-test: безопасность", () => {
  it("проверяет membership организации аккаунта или роль админа", () => {
    expect(testFn).toContain("can_access_organization");
    expect(testFn).toContain("cfg.organization_id");
    expect(testFn).toContain('has_role');
    expect(testFn).toContain('return json({ error: "Forbidden" }, 403)');
  });

  it("не логирует и не возвращает секрет", () => {
    expect(testFn).not.toMatch(/console\.(log|info|warn|error)/);
    expect(testFn).not.toMatch(/secret:\s*cfg\.secret/);
    expect(testFn).not.toMatch(/password:\s*cfg\.secret\s*\}\s*\)/);
    // Ответ содержит только success / error_category / latency_ms.
    expect(testFn).toContain("error_category: success ? null : category");
    expect(testFn).toContain("latency_ms: latency");
  });

  it("IMAP только логинится, письма не читает", () => {
    expect(testFn).toContain("connectImap");
    expect(testFn).toContain("closeImap");
    expect(testFn).not.toMatch(/UID SEARCH|FETCH|SELECT "INBOX"/);
  });
});

describe("mailing-seed-send: безопасность", () => {
  it("не читает получателей кампании", () => {
    expect(seedFn).not.toContain("email_campaign_recipients");
    expect(seedFn).toContain("seed_emails");
  });

  it("ограничивает 1..5 адресов и требует успешный SMTP-тест", () => {
    expect(seedFn).toContain("MAX_SEED = 5");
    expect(seedFn).toContain('smtp_status !== "ok"');
  });

  it("не логирует секрет", () => {
    expect(seedFn).not.toMatch(/console\.(log|info|warn|error)/);
  });
});

describe("миграция отправителей: tenant isolation и шифрование", () => {
  it("RLS ограничивает строки организацией", () => {
    expect(migration).toContain("ALTER TABLE public.mailing_senders ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("organization_id = current_organization_id()");
  });

  it("пароль исключён из SELECT-грантов клиента", () => {
    const grant = migration.slice(
      migration.indexOf("GRANT SELECT ("),
      migration.indexOf("ON public.mailing_senders TO authenticated"),
    );
    expect(grant).not.toContain("password_encrypted");
  });

  it("пароль шифруется триггером на сервере", () => {
    expect(migration).toContain("trigger_encrypt_mailing_sender_password");
    expect(migration).toContain("encrypt_password(NEW.password_encrypted)");
  });

  it("legacy organization_smtp_settings не изменяется", () => {
    expect(migration).not.toContain("organization_smtp_settings");
  });
});
