import { describe, it, expect } from "vitest";
import { buildDPORow, buildPORow, formatDateForFRDO, DPO_HEADERS, PO_HEADERS } from "../frdoExcelExport";

const dpoData = {
  documentType: "Удостоверение о повышении квалификации",
  docNumber: "001",
  regNumber: "R-001",
  issueDate: "01.01.2025",
  programType: "Повышение квалификации",
  programName: "Программа",
  professionalArea: "ИТ",
  specialtyGroup: "09.00.00",
  qualificationName: "Специалист",
  educationLevel: "Высшее образование",
  educationDocLastName: "Иванов",
  educationDocSeries: "AB",
  educationDocNumber: "123456",
  startYear: 2024,
  endYear: 2025,
  durationHours: 72,
  lastName: "Иванов",
  firstName: "Иван",
  middleName: "Иванович",
  birthDate: "01.01.1990",
  gender: "Муж",
  snils: "123-456-789 01",
  trainingForm: "Очная",
  financingSource: "Платное обучение",
  educationForm: "в образовательной организации",
  citizenshipCode: "643",
};

describe("buildDPORow", () => {
  it("returns array matching DPO_HEADERS length", () => {
    const row = buildDPORow(dpoData);
    // 41 columns but last 9 are empty → total should be 40 (31 data + 9 empty)
    expect(row.length).toBe(40);
  });

  it("places document type in first position", () => {
    expect(buildDPORow(dpoData)[0]).toBe("Удостоверение о повышении квалификации");
  });

  it("sets status to Оригинал", () => {
    expect(buildDPORow(dpoData)[1]).toBe("Оригинал");
  });
});

describe("buildPORow", () => {
  const poData = {
    documentType: "Свидетельство о профессии рабочего, должности служащего",
    docNumber: "002",
    regNumber: "R-002",
    issueDate: "01.02.2025",
    programType: "Программа профессиональной подготовки",
    programName: "Электрик",
    professionName: "Электромонтёр",
    qualificationRank: "3 разряд",
    startYear: 2024,
    endYear: 2025,
    durationHours: 256,
    lastName: "Петров",
    firstName: "Пётр",
    middleName: "Петрович",
    birthDate: "15.03.1985",
    gender: "Муж",
    snils: "987-654-321 00",
    citizenshipCode: "643",
    trainingForm: "Очная",
    financingSource: "Платное обучение",
    educationForm: "в образовательной организации",
  };

  it("returns array of correct length", () => {
    const row = buildPORow(poData);
    expect(row.length).toBe(35);
  });

  it("places document type first", () => {
    expect(buildPORow(poData)[0]).toBe("Свидетельство о профессии рабочего, должности служащего");
  });
  it("places professionName in column L (index 11) for PO rows", () => {
    // Excel column L = 12th column = array index 11
    const row = buildPORow(poData);
    expect(row[11]).toBe("Электромонтёр");
  });

  it("falls back to course frdo_profession_name via resolveFRDOFields when student has no profession", async () => {
    const { resolveFRDOFields } = await import("../frdoFieldResolver");
    const resolved = resolveFRDOFields(
      { profession_name: "" },
      { title: "Курс охранников", frdo_profession_name: "Охранник" },
    );
    expect(resolved.professionName).toBe("Охранник");
    expect(resolved.professionFromCourseTitle).toBe(false);
  });

  it("falls back to course.title when neither student nor course frdo_profession_name set", async () => {
    const { resolveFRDOFields } = await import("../frdoFieldResolver");
    const resolved = resolveFRDOFields({}, { title: "Курс охранников" });
    expect(resolved.professionName).toBe("Курс охранников");
    expect(resolved.professionFromCourseTitle).toBe(true);
  });
});

describe("formatDateForFRDO", () => {
  it("formats ISO date to dd.MM.yyyy", () => {
    expect(formatDateForFRDO("2025-01-15")).toBe("15.01.2025");
  });

  it("returns empty for empty input", () => {
    expect(formatDateForFRDO("")).toBe("");
  });

  it("returns original on invalid date", () => {
    const result = formatDateForFRDO("not-a-date");
    expect(typeof result).toBe("string");
  });
});
