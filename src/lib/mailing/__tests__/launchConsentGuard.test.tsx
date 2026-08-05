import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { campaignLaunchAction, launchActionLabel, pickVerifiedSender } from "@/lib/mailing/launchActions";
import { CampaignsManager } from "@/components/admin/broadcast/CampaignsManager";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const runner = read("supabase/functions/run-email-campaign/index.ts");
const editor = read("src/components/admin/broadcast/CampaignEditor.tsx");

const launchMock = vi.fn();
const campaigns = [
  {
    id: "c1", name: "Черновик", subject: "Тема", html_body: "<p>x</p>",
    status: "draft", recipient_source: "none", sender_id: null,
    from_name: null, reply_to: null, created_at: "2026-08-05T10:00:00.000Z",
    total_recipients: 0, sent_count: 0, failed_count: 0, open_count: 0,
    click_count: 0, unsubscribe_count: 0, scheduled_at: null, started_at: null,
  },
];

vi.mock("@/hooks/useEmailCampaigns", () => ({
  useEmailCampaigns: () => ({
    campaigns,
    loading: false,
    refresh: vi.fn(),
    remove: vi.fn(),
    launch: launchMock,
  }),
}));
vi.mock("@/components/admin/broadcast/CampaignEditor", () => ({
  CampaignEditor: () => null,
}));
vi.mock("@/components/admin/broadcast/CampaignReport", () => ({
  CampaignReport: () => null,
}));
vi.mock("@/components/admin/broadcast/WarmupBadge", () => ({
  WarmupBadge: () => <div data-testid="legacy-warmup" />,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({
                  data: [{ id: "s1", label: "Торги", from_email: "sender@example.com", is_active: true, smtp_status: "ok" }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

describe("launch actions", () => {
  it("draft/failed никогда не запускаются напрямую", () => {
    expect(campaignLaunchAction("draft", false)).toBe("prepare");
    expect(campaignLaunchAction("failed", false)).toBe("prepare");
    expect(launchActionLabel("prepare")).toBe("Подготовить запуск");
  });

  it("только paused/зависший sending даёт прямое «Продолжить»", () => {
    expect(campaignLaunchAction("paused", false)).toBe("resume");
    expect(campaignLaunchAction("sending", true)).toBe("resume");
    expect(campaignLaunchAction("sending", false)).toBe("none");
    expect(campaignLaunchAction("completed", false)).toBe("none");
    expect(campaignLaunchAction("scheduled", false)).toBe("none");
  });

  it("проверенным считается только активный отправитель с smtp_status=ok", () => {
    expect(pickVerifiedSender([{ id: "a", label: null, from_email: "a@b.c", is_active: false, smtp_status: "ok" }])).toBeNull();
    expect(pickVerifiedSender([{ id: "a", label: null, from_email: "a@b.c", is_active: true, smtp_status: "untested" }])).toBeNull();
    expect(pickVerifiedSender([{ id: "a", label: "L", from_email: "a@b.c", is_active: true, smtp_status: "ok" }])?.id).toBe("a");
  });
});

describe("CampaignsManager UI", () => {
  it("при проверенном отправителе скрывает legacy-плашку и показывает подключение", async () => {
    render(<CampaignsManager scope="org" organizationId="org-1" />);
    expect(await screen.findByTestId("campaigns-sender-connected")).toBeInTheDocument();
    expect(screen.queryByTestId("legacy-warmup")).toBeNull();
    expect(screen.getByTestId("campaigns-sender-connected").textContent).toContain("sender@example.com");
  });

  it("для черновика кнопка не вызывает прямой запуск", async () => {
    launchMock.mockClear();
    render(<CampaignsManager scope="org" organizationId="org-1" />);
    const btn = await screen.findByTestId("campaign-prepare-c1");
    expect(btn.textContent).toContain("Подготовить запуск");
    btn.click();
    expect(launchMock).not.toHaveBeenCalled();
  });
});

describe("run-email-campaign: серверный consent-guard", () => {
  it("initial user launch требует consent_confirmed=true", () => {
    expect(runner).toContain("consent_confirmed");
    expect(runner).toContain("body.consent_confirmed === true");
    expect(runner).toContain("Требуется подтверждение согласия получателей");
  });

  it("consent-гейт стоит до materialize и quota", () => {
    const consentIdx = runner.indexOf("consentRequired: true");
    const materializeIdx = runner.indexOf("Materialize recipients via canonical resolver");
    const quotaIdx = runner.indexOf("reserve_mailing_campaign_quota");
    expect(consentIdx).toBeGreaterThan(0);
    expect(consentIdx).toBeLessThan(materializeIdx);
    expect(consentIdx).toBeLessThan(quotaIdx);
  });

  it("service-role и resume требуют уже сохранённого подтверждения", () => {
    expect(runner).toContain("isServiceRole || isResumeStatus");
    expect(runner).toContain("storedConsentAt");
    expect(runner).toContain("Согласие получателей не подтверждено");
  });

  it("подтверждение пишется server-side отдельным service-role RPC", () => {
    expect(runner).toContain("confirm_campaign_send_consent_admin");
  });

  it("до materialize проверяются контент и источник получателей", () => {
    expect(runner).toContain("нужны название, тема и тело письма");
    expect(runner).toContain('campaign.recipient_source === "none"');
  });

  it("initial launch с 0 получателями остаётся черновиком", () => {
    expect(runner).toContain("emptyAudience: true");
    expect(runner).toContain("wasInitialMaterialization");
    expect(runner).toContain("кампания оставлена черновиком");
  });

  it("paused/resume с пустой очередью по-прежнему завершается", () => {
    const idx = runner.indexOf("if (pendingCount === 0)");
    const tail = runner.slice(idx, idx + 900);
    expect(tail).toContain('status: "completed"');
  });

  it("unsubscribe продолжает добавляться server-side (не в этой функции)", () => {
    expect(runner).not.toContain("unsubscribe_url}}");
  });
});

describe("CampaignEditor: подтверждение согласия", () => {
  it("launch передаёт consent_confirmed:true", () => {
    expect(editor).toContain("consent_confirmed: true");
  });

  it("планирование сохраняет подтверждение через tenant-safe RPC", () => {
    expect(editor).toContain('confirm_campaign_send_consent"');
    expect(editor).toContain('p_method: "schedule"');
  });

  it("обычное сохранение черновика ничего не подтверждает", () => {
    const idx = editor.indexOf("toast.success(isEditMode ?");
    expect(idx).toBeGreaterThan(0);
    const around = editor.slice(idx - 400, idx);
    expect(around).not.toContain("confirm_campaign_send_consent");
  });
});
