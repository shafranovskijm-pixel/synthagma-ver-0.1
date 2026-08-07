import { describe, it, expect } from "vitest";
import {
  resolveFinalTestLessonId,
  resolveFinalAttestationFacts,
  groupDocumentBatches,
  batchStatusLabel,
  normalizeRegistrationFact,
} from "../factualResolvers";
import { documentDataReadiness, emptyFactualData } from "../factualData";

describe("final test resolver", () => {
  const lessons = [
    { id: "l1", course_id: "c1", type: "test", order_index: 1 },
    { id: "l2", course_id: "c1", type: "video", order_index: 5 },
    { id: "l3", course_id: "c1", type: "test", order_index: 9 },
    { id: "x1", course_id: "c2", type: "test", order_index: 20 },
  ];

  it("берёт последний по order_index тест только своего курса", () => {
    expect(resolveFinalTestLessonId(lessons, "c1")).toBe("l3");
    expect(resolveFinalTestLessonId(lessons, "c2")).toBe("x1");
  });

  it("не смешивает два курса одного ученика: учитывается только финальный урок", () => {
    const attempts = [
      { user_id: "u1", lesson_id: "l1", score: 100, max_score: 100 },
      { user_id: "u1", lesson_id: "x1", score: 95, max_score: 100 },
      { user_id: "u1", lesson_id: "l3", score: 60, max_score: 100 },
      { user_id: "u2", lesson_id: "l3", score: 80, max_score: 100 },
      { user_id: "u9", lesson_id: "l3", score: 100, max_score: 100 },
    ];
    const facts = resolveFinalAttestationFacts(attempts, "l3", ["u1", "u2"]);
    expect(facts).toHaveLength(2);
    expect(facts.find((f) => f.user_id === "u1")?.score).toBe(60);
    expect(facts.find((f) => f.user_id === "u9")).toBeUndefined();
  });

  it("без финального урока не выдаёт фактов", () => {
    expect(resolveFinalAttestationFacts([{ user_id: "u1", lesson_id: "l1", score: 5, max_score: 5 }], null, ["u1"])).toEqual([]);
  });
});

describe("registration fact normalization", () => {
  it("подтягивает ФИО/рождение/пол/паспорт из ФРДО и удостоверения", () => {
    const fact = normalizeRegistrationFact(
      { id: "r1", user_id: "u1", document_number: "77", issue_date: "2026-01-01" } as never,
      {
        last_name: "Иванов",
        first_name: "Иван",
        middle_name: "Ильич",
        birth_date: "1990-02-03",
        gender: "male",
        passport_series: "1234",
        passport_number: "567890",
        citizenship: "РФ",
      } as never,
      null,
    );
    expect(fact.full_name).toBe("Иванов Иван Ильич");
    expect(fact.gender).toBe("М");
    expect(fact.passport).toContain("1234");
  });

  it("показывает понятное русское название системного типа документа", () => {
    const fact = normalizeRegistrationFact(
      {
        user_id: "u1",
        document_type: "certificate",
        document_number: "2026/000001",
        issue_date: "2026-08-07",
      },
      null,
      null,
    );

    expect(fact.document_type).toBe("Удостоверение о повышении квалификации");
  });
});

describe("batch versioning grouping", () => {
  it("v2 текущая, v1 предыдущая, legacy без batch_id — до версионирования", () => {
    const rows = [
      { id: "1", created_at: "2026-01-01T00:00:00Z", package_batch_id: null, package_version: null, is_current: true },
      { id: "2", created_at: "2026-02-01T00:00:00Z", package_batch_id: "b1", package_version: 1, is_current: false },
      { id: "3", created_at: "2026-03-01T00:00:00Z", package_batch_id: "b2", package_version: 2, is_current: true },
    ];
    const groups = groupDocumentBatches(rows);
    expect(groups.map((g) => g.version)).toEqual([2, 1, null]);
    expect(batchStatusLabel(groups[0])).toBe("Текущая");
    expect(batchStatusLabel(groups[1])).toBe("Предыдущая");
    expect(groups[2].legacy).toBe(true);
    expect(groups[2].isCurrent).toBe(false);
  });
});

describe("readiness reporting", () => {
  it("для всех data-driven типов возвращает источник, количество и охват", () => {
    for (const t of ["class_journal", "attestation_sheet", "registration_book", "schedule"]) {
      const r = documentDataReadiness(t, emptyFactualData(), 3);
      expect(r).not.toBeNull();
      expect(r!.source.length).toBeGreaterThan(0);
      expect(r!.recordCount).toBe(0);
      expect(typeof r!.coverage).toBe("string");
      expect(r!.finalBlocked).toBe(true);
    }
  });
});
