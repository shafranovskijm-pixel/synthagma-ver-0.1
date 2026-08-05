import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateSeedTest } from "@/lib/mailing/senderPresets";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const seedFn = read("supabase/functions/mailing-seed-send/index.ts");
const migDir = "supabase/migrations";
const corrective = readdirSync(resolve(process.cwd(), migDir))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => read(`${migDir}/${f}`))
  .find((sql) => sql.includes("REVOKE INSERT, UPDATE ON public.mailing_senders FROM authenticated"))!;

describe("P0: колонки статуса отправителя недоступны authenticated", () => {
  it("есть корректирующая миграция с REVOKE табличных INSERT/UPDATE", () => {
    expect(corrective).toBeTruthy();
  });

  it("грант UPDATE выдан только на безопасные колонки настроек", () => {
    const upd = corrective.slice(
      corrective.indexOf("GRANT UPDATE ("),
      corrective.indexOf("ON public.mailing_senders TO authenticated;", corrective.indexOf("GRANT UPDATE (")),
    );
    for (const safe of ["label", "from_email", "smtp_host", "password_encrypted", "daily_limit", "is_active"]) {
      expect(upd).toContain(safe);
    }
    for (const forbidden of [
      "smtp_status",
      "imap_status",
      "last_tested_at",
      "smtp_error_category",
      "imap_error_category",
      "smtp_latency_ms",
      "imap_latency_ms",
      "imap_last_tested_at",
      "last_error",
    ]) {
      expect(upd).not.toContain(forbidden);
    }
  });

  it("журнал seed-отправок только для чтения клиентом и с RLS по организации", () => {
    expect(corrective).toContain("GRANT SELECT ON public.mailing_seed_ledger TO authenticated");
    expect(corrective).not.toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailing_seed_ledger");
    expect(corrective).toContain("ALTER TABLE public.mailing_seed_ledger ENABLE ROW LEVEL SECURITY");
    expect(corrective).toContain("organization_id = current_organization_id()");
  });

  it("в журнале нет колонок тела письма и пароля", () => {
    const ddl = corrective.slice(
      corrective.indexOf("CREATE TABLE IF NOT EXISTS public.mailing_seed_ledger"),
      corrective.indexOf("GRANT SELECT ON public.mailing_seed_ledger"),
    );
    expect(ddl).not.toMatch(/html|body|subject|password|secret/i);
  });
});

describe("P0: атомарная квота seed-отправок", () => {
  it("RPC резервирования берёт advisory lock и проверяет лимит/кулдаун/статус", () => {
    expect(corrective).toContain("reserve_mailing_seed_quota");
    expect(corrective).toContain("pg_advisory_xact_lock(hashtextextended('mailing_seed:'");
    expect(corrective).toContain("'daily_limit'");
    expect(corrective).toContain("'cooldown'");
    expect(corrective).toContain("'smtp_not_tested'");
  });

  it("RPC квоты и записи результата доступны только service_role", () => {
    expect(corrective).toContain(
      "REVOKE ALL ON FUNCTION public.reserve_mailing_seed_quota(uuid, uuid, int, uuid, int) FROM authenticated",
    );
    expect(corrective).toContain(
      "GRANT EXECUTE ON FUNCTION public.reserve_mailing_seed_quota(uuid, uuid, int, uuid, int) TO service_role",
    );
    expect(corrective).toContain(
      "REVOKE ALL ON FUNCTION public.record_mailing_seed_result(uuid, int, int) FROM authenticated",
    );
    expect(corrective).toContain(
      "GRANT EXECUTE ON FUNCTION public.record_mailing_seed_result(uuid, int, int) TO service_role",
    );
  });
});

describe("P0: контракт mailing-seed-send", () => {
  it("требует campaign_id и sender_id", () => {
    expect(seedFn).toContain('return json({ error: "campaign_id, sender_id required" }, 400)');
  });

  it("тема и HTML берутся из кампании, а не из запроса", () => {
    expect(seedFn).toContain("campaign.subject");
    expect(seedFn).toContain("campaign.html_body");
    expect(seedFn).not.toContain("body?.subject");
    expect(seedFn).not.toContain("body?.html");
  });

  it("никогда не читает получателей кампании", () => {
    expect(seedFn).not.toContain("email_campaign_recipients");
    expect(seedFn).toContain("seed_emails");
  });

  it("проверяет совпадение организации кампании и отправителя + доступ вызывающего", () => {
    expect(seedFn).toContain("campaign.organization_id !== sender.organization_id");
    expect(seedFn).toContain("can_access_organization");
    expect(seedFn).toContain('has_role');
  });

  it("smtp_status читается с сервера и обязателен, статус тут не выставляется", () => {
    expect(seedFn).toContain('sender.smtp_status !== "ok"');
    expect(seedFn).not.toMatch(/smtp_status:\s*"ok"/);
    expect(seedFn).not.toMatch(/last_tested_at/);
  });

  it("резервирует квоту до отправки и пишет только счётчики", () => {
    const reservePos = seedFn.indexOf("reserve_mailing_seed_quota");
    const sendPos = seedFn.indexOf("await sendSmtpEmail(");
    expect(reservePos).toBeGreaterThan(0);
    expect(reservePos).toBeLessThan(sendPos);
    expect(seedFn).toContain("record_mailing_seed_result");
    expect(seedFn).toContain("p_sent: sent");
    expect(seedFn).toContain("p_failed: failed");
  });

  it("ограничивает 1..5 адресов и не логирует секреты/тело", () => {
    expect(seedFn).toContain("MAX_SEED = 5");
    expect(seedFn).not.toMatch(/console\.(log|info|warn|error)/);
  });
});

describe("P0: клиентский гейт seed-отправки", () => {
  it("без сохранённой кампании отправка заблокирована", () => {
    const r = validateSeedTest({
      senderAccountId: "s1",
      smtpStatus: "ok",
      seedRaw: "a@b.ru",
      campaignId: null,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("черновик");
  });

  it("с кампанией, отправителем и ok-статусом проходит", () => {
    const r = validateSeedTest({
      senderAccountId: "s1",
      smtpStatus: "ok",
      seedRaw: "a@b.ru, c@d.ru",
      campaignId: "c1",
    });
    expect(r.ok).toBe(true);
    expect(r.emails).toEqual(["a@b.ru", "c@d.ru"]);
  });
});
