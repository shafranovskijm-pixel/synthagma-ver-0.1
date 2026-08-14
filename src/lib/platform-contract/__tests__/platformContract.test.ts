import { describe, expect, it } from "vitest";
import {
  PLATFORM_CONTRACT_PLANS,
  derivePlatformContractDraft,
  formatRub,
  buildPlatformContractPagesHtml,
  platformContractFileName,
  PROJECT_WATERMARK_TEXT,
  CONTRACT_HEADER_TEXT,
} from "..";
import { SUBSCRIPTION_PLANS, YEARLY_DISCOUNT, formatStorageSize } from "@/constants/subscriptionPlans";

const draft = (plan: any = "standard", months: 1 | 12 = 1, extra: any = {}) =>
  derivePlatformContractDraft({ plan, periodMonths: months, date: "2026-08-08", ...extra });

describe("платформенный проект договора: тарифы", () => {
  it("допускаются только ключи SUBSCRIPTION_PLANS, standard вместо basic", () => {
    expect(PLATFORM_CONTRACT_PLANS).toEqual(["free", "start", "standard", "professional", "maximum"]);
    expect(PLATFORM_CONTRACT_PLANS).toContain("standard");
    expect(PLATFORM_CONTRACT_PLANS).not.toContain("basic" as never);
    PLATFORM_CONTRACT_PLANS.forEach((p) => expect(SUBSCRIPTION_PLANS[p]).toBeTruthy());
  });

  it("цена берётся только из SUBSCRIPTION_PLANS", () => {
    PLATFORM_CONTRACT_PLANS.forEach((p) => {
      expect(draft(p).monthlyPrice).toBe(SUBSCRIPTION_PLANS[p].price);
    });
  });

  it("месячный период — без скидки", () => {
    const d = draft("standard", 1);
    expect(d.discountRate).toBe(0);
    expect(d.totalAmount).toBe(SUBSCRIPTION_PLANS.standard.price);
  });

  it("годовой период — скидка YEARLY_DISCOUNT из общего источника", () => {
    const d = draft("standard", 12);
    const gross = SUBSCRIPTION_PLANS.standard.price * 12;
    const total = Math.round(gross * (1 - YEARLY_DISCOUNT));
    expect(d.discountRate).toBe(YEARLY_DISCOUNT);
    expect(d.effectiveMonthlyPrice).toBe(total / 12);
    expect(d.totalAmount).toBe(total);
    expect(d.discountAmount).toBe(gross - total);
  });

  it("годовой Start рассчитывается как 4 490 × 12 × 85% без помесячной погрешности", () => {
    const d = draft("start", 12);
    expect(d.effectiveMonthlyPrice).toBe(3816.5);
    expect(d.totalAmount).toBe(45_798);
    expect(d.discountAmount).toBe(8_082);
    expect(formatRub(d.effectiveMonthlyPrice)).toBe("3 816,50 ₽");
  });

  it("бесплатный тариф — 0 ₽ и без скидки", () => {
    const d = draft("free", 12);
    expect(d.totalAmount).toBe(0);
    expect(d.discountRate).toBe(0);
  });

  it("лимиты соответствуют тарифу", () => {
    const d = draft("start");
    const l = SUBSCRIPTION_PLANS.start.limits;
    expect(d.limits.courses).toBe(String(l.maxCourses));
    expect(d.limits.students).toBe(String(l.maxStudents));
    expect(d.limits.storage).toBe(formatStorageSize(l.storageBytes));
    expect(draft("professional").limits.courses).toBe("Без ограничений");
  });

  it("статус проекта без официального номера", () => {
    expect(draft().status).toBe("project");
    expect(platformContractFileName(draft("professional", 12))).toBe(
      "SINTAGMA-contract-project-professional-2026-08-08.pdf",
    );
  });
});

describe("платформенный проект договора: HTML", () => {
  const pages = buildPlatformContractPagesHtml(draft("standard", 12));

  it("документ из 7 страниц A4 с колонтитулами", () => {
    expect(pages).toHaveLength(7);
    pages.forEach((p, i) => {
      expect(p).toContain("width:794px;height:1123px");
      expect(p).toContain('class="a4-page"');
      expect(p).toContain(CONTRACT_HEADER_TEXT);
      expect(p).toContain(`Страница ${i + 1} из 7`);
      expect(p.replace(/<[^>]+>/g, "").trim().length).toBeGreaterThan(120);
    });
  });

  it("ровно один водяной знак «проект» на страницу", () => {
    pages.forEach((p) => {
      expect(p.split("data-project-watermark").length - 1).toBe(1);
      expect(p.split(PROJECT_WATERMARK_TEXT).length - 1).toBe(1);
    });
  });

  it("нет запрещённых формулировок", () => {
    const all = pages.join(" ");
    expect(all).not.toMatch(/SkillSpace/i);
    expect(all).not.toMatch(/99[.,]5/);
    expect(all).not.toMatch(/автоматическ[а-яё]* (передач|выгрузк)[а-яё]* [^.]{0,30}ФРДО/i);
    expect(all).toMatch(/проверк[а-яё]+ и подготовк[а-яё]+ данных и файла/i);
  });

  it("нет неразрешённых undefined/null/NaN", () => {
    const all = pages.join(" ");
    expect(all).not.toMatch(/undefined|null|NaN/);
  });

  it("пользовательские данные экранируются", () => {
    const pagesXss = buildPlatformContractPagesHtml(
      draft("standard", 1, {
        customer: { name: '<script>alert("x")</script>', inn: "1&2" },
      }),
    );
    const all = pagesXss.join(" ");
    expect(all).not.toContain("<script>");
    expect(all).toContain("&lt;script&gt;");
    expect(all).toContain("1&amp;2");
  });

  it("реквизиты заказчика в публичной версии — placeholders", () => {
    expect(pages[0]).toContain("Организация-заказчик");
  });
});
