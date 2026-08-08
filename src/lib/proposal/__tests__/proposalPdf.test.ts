import { describe, expect, it } from "vitest";
import { buildProposalPagesHtml } from "../generateProposalPdf";
import {
  PROPOSAL_PDF_FILE_NAME,
  getPublicPlanSummaries,
  getEntryPaidPlan,
} from "../proposalContent";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import { PLAN_ORDER } from "@/lib/pricingFeatureRows";

describe("единое КП", () => {
  it("имя файла фиксировано", () => {
    expect(PROPOSAL_PDF_FILE_NAME).toBe("SINTAGMA-commercial-proposal-2026.pdf");
  });

  it("тарифы берутся только из PLAN_ORDER + SUBSCRIPTION_PLANS", () => {
    const plans = getPublicPlanSummaries();
    expect(plans.map((p) => p.id)).toEqual([...PLAN_ORDER]);
    plans.forEach((p) => {
      expect(p.price).toBe(SUBSCRIPTION_PLANS[p.id as keyof typeof SUBSCRIPTION_PLANS].price);
    });
  });

  it("минимальный платный тариф соответствует источнику", () => {
    const entry = getEntryPaidPlan();
    const minPaid = Math.min(
      ...PLAN_ORDER.map((id) => SUBSCRIPTION_PLANS[id].price).filter((p) => p > 0),
    );
    expect(entry.price).toBe(minPaid);
  });

  it("PDF содержит 5 непустых страниц A4", () => {
    const pages = buildProposalPagesHtml();
    expect(pages).toHaveLength(5);
    pages.forEach((html) => {
      expect(html).toContain("width:794px;height:1123px");
      expect(html.replace(/<[^>]+>/g, "").trim().length).toBeGreaterThan(120);
    });
  });

  it("формулировки честные: ФРДО, рассылки, срок запуска", () => {
    const all = buildProposalPagesHtml().join("\n");
    expect(all).toContain("Поможем запустить за 7 дней");
    expect(all).toContain("проверку и подготовку данных и файла");
    expect(all).toContain("ФРДО+");
    expect(all).toContain("SMTP");
    expect(all).not.toMatch(/100\s?%\s?(гарант|доставк)/i);
    expect(all).not.toMatch(/bounce|suppression/i);
  });

  it("контакты и юридические ссылки канонические", () => {
    const all = buildProposalPagesHtml().join("\n");
    expect(all).toContain("support@sintagma.com.ru");
    expect(all).toContain("sintagma.com.ru");
    expect(all).toContain("https://sintagma.com.ru/documents/paid-plan-offer");
    expect(all).toContain("https://sintagma.com.ru/proposal/platform");
  });

  it("3D-тренажёры на «Профессиональном» помечены как за доп. плату", () => {
    const plans = getPublicPlanSummaries();
    const pro = plans.find((p) => p.id === "professional")!;
    expect(pro.features).toContain("3D-тренажёры — за дополнительную плату");
    expect(pro.features).not.toContain("3D-тренажёры");

    const all = buildProposalPagesHtml().join("\n");
    expect(all).toContain("3D-тренажёры — за дополнительную плату");
  });
});
