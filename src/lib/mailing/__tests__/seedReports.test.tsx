import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  buildSeedLedgerQuery,
  mapSeedLedgerRow,
  seedReportToCsv,
  SEED_REPORT_SELECT,
  SEED_LEDGER_FORBIDDEN,
  seedRowStatus,
} from "@/lib/mailing/seedReports";
import { MailingReportsTab } from "@/components/mailing/MailingReportsTab";

const seedState: { data: any[] | null; error: any } = { data: [], error: null };

vi.mock("@/hooks/useEmailCampaigns", () => ({
  useEmailCampaigns: () => ({ campaigns: [], loading: false }),
}));
vi.mock("@/components/admin/broadcast/CampaignReport", () => ({
  CampaignReport: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve(seedState),
          }),
        }),
      }),
    }),
  },
}));

const RAW = {
  id: "l1",
  created_at: "2026-08-05T10:41:58.000Z",
  seed_count: 5,
  sent_count: 5,
  failed_count: 0,
  email_campaigns: { name: "Тест 44-ФЗ" },
  mailing_senders: { label: "Торги", from_email: "ngal@example.com" },
};

describe("seedReports safe allowlist", () => {
  it("selects only safe columns", () => {
    for (const bad of SEED_LEDGER_FORBIDDEN) {
      expect(SEED_REPORT_SELECT).not.toContain(bad);
    }
    expect(SEED_REPORT_SELECT).toContain("seed_count");
  });

  it("builds a tenant-scoped, limited query", () => {
    const calls: any[] = [];
    const chain: any = {
      from: (t: string) => (calls.push(["from", t]), chain),
      select: (s: string) => (calls.push(["select", s]), chain),
      eq: (c: string, v: string) => (calls.push(["eq", c, v]), chain),
      order: (c: string, o: any) => (calls.push(["order", c, o]), chain),
      limit: (n: number) => (calls.push(["limit", n]), chain),
    };
    buildSeedLedgerQuery(chain, "org-1");
    expect(calls).toEqual([
      ["from", "mailing_seed_ledger"],
      ["select", SEED_REPORT_SELECT],
      ["eq", "organization_id", "org-1"],
      ["order", "created_at", { ascending: false }],
      ["limit", 50],
    ]);
  });

  it("computes statuses", () => {
    expect(seedRowStatus({ seed_count: 5, sent_count: 5, failed_count: 0 })).toBe("ok");
    expect(seedRowStatus({ seed_count: 5, sent_count: 0, failed_count: 5 })).toBe("failed");
    expect(seedRowStatus({ seed_count: 5, sent_count: 3, failed_count: 2 })).toBe("partial");
    expect(seedRowStatus({ seed_count: 5, sent_count: 0, failed_count: 0 })).toBe("pending");
  });

  it("CSV contains no PII or content columns", () => {
    const csv = seedReportToCsv([mapSeedLedgerRow(RAW)]);
    expect(csv).toContain("Принято SMTP");
    expect(csv).toContain("Тест 44-ФЗ");
    expect(csv).toContain("5;5;0");
    expect(csv).not.toMatch(/seed_email|@seed|<html|password/i);
  });
});

describe("MailingReportsTab seed section", () => {
  beforeEach(() => {
    seedState.data = [RAW];
    seedState.error = null;
  });

  it("renders 5 / 5 / 0 for a real row", async () => {
    render(<MailingReportsTab organizationId="org-1" />);
    expect(await screen.findByText("5 / 5 / 0")).toBeInTheDocument();
    expect(screen.getByText(/Принято SMTP не гарантирует Входящие/)).toBeInTheDocument();
  });

  it("shows a safe empty state", async () => {
    seedState.data = [];
    render(<MailingReportsTab organizationId="org-1" />);
    expect(await screen.findByText(/Тестовых отправок пока нет/)).toBeInTheDocument();
  });

  it("shows a safe error state", async () => {
    seedState.data = null;
    seedState.error = { message: "boom" };
    render(<MailingReportsTab organizationId="org-1" />);
    expect(await screen.findByText(/Не удалось загрузить журнал/)).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
  });
});
