import { describe, expect, it } from "vitest";
import {
  buildCourseReviewSystemPrompt,
  formatReviewDate,
  guardUnverifiedLegalFindings,
  REVIEW_REVISION,
} from "../../../supabase/functions/review-course/review-policy";

describe("course review legal safety policy", () => {
  it("exposes a deployment revision marker", () => {
    expect(REVIEW_REVISION).toBe("irr-legal-official-facts-v2");
  });

  it("uses the current Moscow date instead of model knowledge", () => {
    const now = new Date("2026-08-13T21:30:00.000Z");

    expect(formatReviewDate(now)).toBe("14.08.2026");
    expect(buildCourseReviewSystemPrompt(now)).toContain(
      "Документ, датированный раньше 14.08.2026, нельзя называть будущим",
    );
  });

  it("forbids unsupported claims that a legal act does not exist", () => {
    const prompt = buildCourseReviewSystemPrompt(new Date("2026-08-14T00:00:00.000Z"));

    expect(prompt).toContain("Не утверждай как факт, что нормативный акт не существует");
    expect(prompt).toContain("У тебя нет доступа к актуальной официальной базе нормативных актов");
    expect(prompt).toContain("Приказ Минэнерго России от 14.05.2025 № 511");
    expect(prompt).toContain("Вступил в силу 01.09.2025 и действует до 01.09.2030");
    expect(prompt).toContain("признал утратившим силу приказ Минэнерго России от 24.03.2003 № 115");
    expect(prompt).toContain("publication.pravo.gov.ru");
  });

  it("corrects the false claim about order No. 511 using the verified fact pack", () => {
    const result = guardUnverifiedLegalFindings({
      summary: "Курс непригоден из-за несуществующего приказа",
      findings: [
        {
          id: "legal-1",
          lesson_title: "Общие вопросы",
          type: "legislation",
          severity: "critical",
          description: "Приказ Минэнерго №511 от 14.05.2025 не существует. Дата находится в будущем, приказ не издавался.",
          suggestion: "Заменить на действующий приказ Минэнерго №115 от 24.03.2003",
          target_kind: "lesson_title",
          target_id: "lesson-1",
          patch: { title: "Исправленный урок" },
        },
      ],
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings?.[0]).toMatchObject({
      severity: "info",
      target_kind: "none",
      target_id: "",
      patch: {},
    });
    expect(result.findings?.[0].description).toContain("приказ Минэнерго России от 14.05.2025 № 511 существует");
    expect(result.findings?.[0].description).toContain("действует до 01.09.2030");
    expect(result.findings?.[0].suggestion).toContain("№ 511 с 01.09.2025 признал утратившим силу");
    expect(result.findings?.[0].suggestion).toContain(
      "https://publication.pravo.gov.ru/document/0001202506020074",
    );
    expect(result.summary).not.toContain("Курс непригоден");
    expect(result.summary).toContain("ошибочных AI-выводов о приказе Минэнерго № 511 исправлено");
  });

  it("demotes and disables automatic application of other unverified legal findings", () => {
    const result = guardUnverifiedLegalFindings({
      summary: "Непроверенный юридический вывод",
      findings: [
        {
          id: "legal-other",
          type: "legislation",
          severity: "critical",
          description: "Постановление №999 якобы утратило силу",
          suggestion: "Заменить документ",
          target_kind: "lesson_title",
          target_id: "lesson-2",
          patch: { title: "Неверная автоматическая правка" },
        },
      ],
    });

    expect(result.findings?.[0]).toMatchObject({
      severity: "warning",
      target_kind: "none",
      target_id: "",
      patch: {},
    });
    expect(result.findings?.[0].description).toContain("не подтверждён официальным источником");
    expect(result.summary).toContain("требуют ручной сверки");
  });

  it("does not change non-legal findings", () => {
    const finding = {
      id: "test-1",
      type: "test",
      severity: "critical",
      description: "Неверно отмечен правильный ответ",
    };

    const result = guardUnverifiedLegalFindings({
      summary: "Найдена ошибка теста",
      findings: [finding],
    });

    expect(result.findings?.[0]).toEqual(finding);
    expect(result.summary).toBe("Найдена ошибка теста");
  });
});
