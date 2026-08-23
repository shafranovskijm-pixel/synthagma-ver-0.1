import { describe, it, expect } from "vitest";
import {
  DOC_REQUIRED_KEYS,
  GENERIC_DOC_REQUIRED_KEYS,
  GORELTECH_DOC_REQUIRED_KEYS,
  missingDocRequirements as missingDocRequirementsForProfile,
  missingPackageRequirements as missingPackageRequirementsForProfile,
} from "../packageTypes";

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

const missingDocRequirements = (
  docType: string,
  src: typeof full,
  mode: "blank" | "data" = "data",
) => missingDocRequirementsForProfile(docType, src, mode, "goreltech");

const missingPackageRequirements = (
  docTypes: readonly string[],
  src: typeof full,
  mode: "blank" | "data" = "data",
) => missingPackageRequirementsForProfile(docTypes, src, mode, "goreltech");

describe("missingDocRequirements", () => {
  it("фиксирует поля, которые действительно печатаются в девяти Word-документах", () => {
    expect(GORELTECH_DOC_REQUIRED_KEYS).toEqual({
      enrollment_order: ["org_name", "group_number", "program_title", "program_hours", "start_date", "end_date", "students"],
      expulsion_order: ["org_name", "group_number", "program_title", "program_hours", "start_date", "end_date", "students"],
      student_list: ["org_name", "group_number", "program_title", "students"],
      class_journal: ["org_name", "group_number", "program_title", "program_hours", "instructor_name", "training_dates_4", "students"],
      schedule: ["program_title", "program_hours", "instructor_name"],
      attestation_sheet: ["org_name", "group_number", "program_title", "program_hours", "start_date", "end_date", "instructor_name", "students"],
      registration_book: ["org_name", "group_number", "program_title", "start_date", "end_date", "students"],
      title_page: ["org_name", "group_number", "program_title", "start_date", "end_date"],
      pass: ["org_name", "group_number", "program_title", "program_hours", "start_date", "end_date", "students"],
    });
  });

  it("не находит пропусков при полных данных", () => {
    Object.keys(GORELTECH_DOC_REQUIRED_KEYS).forEach(docType => {
      expect(missingDocRequirements(docType, full)).toEqual([]);
    });
  });

  it("оба приказа требуют полный период, часы и учеников", () => {
    const noEnd = { ...full, end_date: "" };
    expect(missingDocRequirements("enrollment_order", noEnd)).toContain("дата окончания обучения");
    expect(missingDocRequirements("expulsion_order", noEnd)).toContain("дата окончания обучения");
    for (const docType of ["enrollment_order", "expulsion_order"]) {
      expect(missingDocRequirements(docType, { ...full, start_date: "" })).toContain("дата начала обучения");
      expect(missingDocRequirements(docType, { ...full, program_hours: 0 })).toContain("объём часов");
      expect(missingDocRequirements(docType, { ...full, students_count: 0 })).toContain("ученики в группе");
    }
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

  it("разрешает оставить даты очных занятий пустыми в рабочем бланке", () => {
    const withoutDates = { ...full, training_dates_count: 0 };
    expect(missingDocRequirements("class_journal", withoutDates, "blank")).toEqual([]);
    expect(missingDocRequirements("class_journal", withoutDates, "data")).toContain("4 даты занятий");
  });

  it("не выдумывает обязательного руководителя при явном пустом подписанте", () => {
    Object.keys(GORELTECH_DOC_REQUIRED_KEYS).forEach(docType => {
      expect(missingDocRequirements(docType, { ...full, org_director_name: "" })).toEqual([]);
    });
  });

  it("расписание проверяет печатаемые часы и преподавателя, но не непечатаемые границы группы", () => {
    expect(missingDocRequirements("schedule", {
      ...full,
      group_number: "",
      start_date: "",
      end_date: "",
    })).toEqual([]);
    expect(missingDocRequirements("schedule", { ...full, program_hours: 0 })).toContain("объём часов");
    expect(missingDocRequirements("schedule", { ...full, instructor_name: "" })).toContain("преподаватель");
  });

  it("проверяет часы, период и преподавателя итоговой ведомости", () => {
    expect(missingDocRequirements("attestation_sheet", { ...full, program_hours: 0 })).toContain("объём часов");
    expect(missingDocRequirements("attestation_sheet", { ...full, start_date: "" })).toContain("дата начала обучения");
    expect(missingDocRequirements("attestation_sheet", { ...full, end_date: "" })).toContain("дата окончания обучения");
    expect(missingDocRequirements("attestation_sheet", { ...full, instructor_name: "" })).toContain("преподаватель");
  });

  it("проверяет период титульного листа и программу, часы, период пропуска", () => {
    expect(missingDocRequirements("title_page", { ...full, start_date: "" })).toContain("дата начала обучения");
    expect(missingDocRequirements("title_page", { ...full, end_date: "" })).toContain("дата окончания обучения");
    expect(missingDocRequirements("pass", { ...full, program_title: "" })).toContain("название программы");
    expect(missingDocRequirements("pass", { ...full, program_hours: 0 })).toContain("объём часов");
    expect(missingDocRequirements("pass", { ...full, start_date: "" })).toContain("дата начала обучения");
    expect(missingDocRequirements("pass", { ...full, end_date: "" })).toContain("дата окончания обучения");
  });

  it("объединяет причины по реально выбранным документам без дублей", () => {
    expect(missingPackageRequirements(
      ["enrollment_order", "attestation_sheet"],
      { ...full, program_hours: 0, end_date: "" },
    )).toEqual(["объём часов", "дата окончания обучения"]);
  });

  it("не переносит требования Word-шаблонов ГОРЭЛТЕХ в универсальные документы", () => {
    expect(DOC_REQUIRED_KEYS).toBe(GENERIC_DOC_REQUIRED_KEYS);
    expect(missingDocRequirementsForProfile("schedule", {
      ...full,
      group_number: "",
      start_date: "",
      end_date: "",
    }, "data", "generic")).toEqual([
      "номер группы",
      "дата начала обучения",
      "дата окончания обучения",
    ]);
    expect(missingDocRequirementsForProfile(
      "class_journal",
      { ...full, org_director_name: "" },
      "data",
      "generic",
    )).toContain("руководитель учебного центра");
  });
});
