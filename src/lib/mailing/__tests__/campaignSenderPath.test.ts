import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeQuotaGate } from "@/lib/emailQuotaGate";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const sendFn = read("supabase/functions/send-campaign-email/index.ts");
const runFn = read("supabase/functions/run-email-campaign/index.ts");
const editor = read("src/components/admin/broadcast/CampaignEditor.tsx");

describe("send-campaign-email: путь mailing_senders", () => {
  it("happy path использует mailing_senders + get_mailing_sender_secret", () => {
    expect(sendFn).toContain('(campaign as any).sender_id');
    expect(sendFn).toContain('.from("mailing_senders")');
    expect(sendFn).toContain('get_mailing_sender_secret');
  });

  it("запрещает чужой / отключённый / непроверенный отправитель", () => {
    expect(sendFn).toContain("sender.organization_id !== campaign.organization_id");
    expect(sendFn).toContain("sender.is_active !== true");
    expect(sendFn).toContain('sender.smtp_status !== "ok"');
  });

  it("from_email берётся только с сервера, from_name может быть из кампании", () => {
    expect(sendFn).toContain("from_email: cfg.from_email");
    expect(sendFn).toContain("from_name: campaign.from_name || cfg.from_name");
  });

  it("секрет не логируется и не возвращается клиенту", () => {
    expect(sendFn).not.toMatch(/console\.[a-z]+\([^)]*secret/i);
    expect(sendFn).not.toMatch(/secret:\s*cfg\.secret/);
  });

  it("legacy fallback для кампаний без sender_id сохранён", () => {
    expect(sendFn).toContain("get_decrypted_org_smtp");
  });
});

describe("run-email-campaign: квота отправителя", () => {
  it("валидирует sender до материализации и квоты", () => {
    const senderIdx = runFn.indexOf("Sender validation");
    const quotaIdx = runFn.indexOf("reserve_mailing_campaign_quota");
    const resolveIdx = runFn.indexOf("resolve_campaign_recipients");
    expect(senderIdx).toBeGreaterThan(0);
    expect(senderIdx).toBeLessThan(resolveIdx);
    expect(senderIdx).toBeLessThan(quotaIdx);
  });

  it("для нового пути не вызывает claim_org_email_quota", () => {
    const branch = runFn.slice(
      runFn.indexOf("} else if (mailingSenderId) {"),
      runFn.indexOf("      if (!campaign.organization_id) {"),
    );
    expect(branch).toContain("reserve_mailing_campaign_quota");
    expect(branch).not.toContain("claim_org_email_quota");
  });

  it("legacy кампании без sender_id сохраняют старую квоту", () => {
    expect(runFn).toContain("claim_org_email_quota");
  });

  it("итоги пишет отдельный service-role RPC", () => {
    expect(runFn).toContain("record_mailing_campaign_result");
  });

  it("отклоняет чужого / отключённого / непроверенного отправителя", () => {
    expect(runFn).toContain("Отправитель принадлежит другой организации");
    expect(runFn).toContain("Отправитель отключён");
    expect(runFn).toContain("Отправитель не прошёл SMTP-проверку");
  });
});

describe("миграция квоты кампаний", () => {
  const migration = read(
    "supabase/migrations/" +
      require("node:fs")
        .readdirSync(resolve(process.cwd(), "supabase/migrations"))
        .filter((f: string) => f.endsWith(".sql"))
        .find((f: string) =>
          read(`supabase/migrations/${f}`).includes("reserve_mailing_campaign_quota"),
        )!,
  );

  it("атомарность через advisory lock и проверку соответствия", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("campaign_org_mismatch");
    expect(migration).toContain("campaign_sender_mismatch");
    expect(migration).toContain("smtp_not_tested");
  });

  it("суточный лимит ограничен 1..10000 на сервере", () => {
    expect(migration).toContain("LEAST(GREATEST(COALESCE(v_limit, 1), 1), 10000)");
  });

  it("прямой вызов authenticated запрещён", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.reserve_mailing_campaign_quota(uuid, uuid, int, uuid) FROM authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.reserve_mailing_campaign_quota(uuid, uuid, int, uuid) TO service_role",
    );
  });

  it("журнал не хранит письма, пароли и адреса получателей", () => {
    const table = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS public.mailing_campaign_ledger"),
      migration.indexOf("GRANT SELECT ON public.mailing_campaign_ledger"),
    );
    expect(table).not.toMatch(/email|subject|html|password|error/i);
  });
});

describe("UI: выбранный проверенный отправитель считается настроенным", () => {
  it("quota gate не блокирует запуск при senderVerified", () => {
    const gate = computeQuotaGate({
      scope: "org",
      organizationId: "org-1",
      status: null,
      loading: false,
      errorKind: "network",
      senderVerified: true,
    });
    expect(gate.blocksLaunch).toBe(false);
    expect(gate.reason).toBeNull();
  });

  it("без отправителя legacy-блокировка сохраняется", () => {
    const gate = computeQuotaGate({
      scope: "org",
      organizationId: "org-1",
      status: null,
      loading: true,
      errorKind: null,
    });
    expect(gate.blocksLaunch).toBe(true);
  });

  it("legacy-плашка прогрева скрыта, когда отправитель проверен", () => {
    expect(editor).toContain("{scopeKey && !senderVerified && <WarmupBadge scopeKey={scopeKey} />}");
    expect(editor).toContain("campaign-sender-ready");
    expect(editor).toContain("get_mailing_sender_quota");
  });

  it("запуск всё равно требует отправителя", () => {
    expect(editor).toContain('(scope === "org" && !senderAccountId)');
  });
});
