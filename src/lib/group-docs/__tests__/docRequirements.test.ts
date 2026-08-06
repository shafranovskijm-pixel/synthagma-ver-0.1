import { describe, it, expect } from "vitest";
import { missingDocRequirements } from "../packageTypes";

const full = {
  org_name: "ООО «УЦ»",
  org_director_name: "Иванов И.И.",
  group_number: "12",
  program_title: "Водитель автомобиля",
  program_hours: 72,
  start_date: "2026-01-10",
  end_date: "2026-02-10",
  students_count: 3,
  instructor_name: "Иванов Иван Иванович",
  training_dates_count: 4,
};

describe("missingDocRequirements", () => {
  it("не находит пропусков при полных данных", () => {
    expect(missingDocRequirements("enrollment_order", full)).toEqual([]);
    expect(missingDocRequirements("student_list", full)).toEqual([]);
  });

  it("требует только свои поля", () => {
    const noEnd = { ...full, end_date: "" };
    expect(missingDocRequirements("enrollment_order", noEnd)).toEqual([]);
    expect(missingDocRequirements("expulsion_order", noEnd)).toContain("дата окончания обучения");
  });

  it("блокирует документ без учеников", () => {
    expect(missingDocRequirements("class_journal", { ...full, students_count: 0 })).toContain("ученики в группе");
  });

  it("считает нулевые часы пропуском", () => {
    expect(missingDocRequirements("class_journal", { ...full, program_hours: 0 })).toContain("объём часов");
  });

  it("журнал требует явного преподавателя и ровно 4 даты", () => {
    expect(missingDocRequirements("class_journal", { ...full, instructor_name: "" })).toContain("преподаватель");
    expect(missingDocRequirements("class_journal", { ...full, training_dates_count: 3 })).toContain("4 даты занятий");
    expect(missingDocRequirements("class_journal", full)).toEqual([]);
  });
});
