/** Готовность данных DOCX-договора и изоляция HTML/DOCX-потоков. */
import { describe, expect, it } from "vitest";
import {
  GORELTECH_CURRICULA,
  GORELTECH_TEMPLATE_KEY,
  evaluateDocxReadiness,
  isDocxDraftReady,
  type DocxContractDraft,
} from "../docxContract";
import { canProceedStep } from "../wizardFlow";

const CURRICULUM = GORELTECH_CURRICULA[0];

const COMPANY_KEYS = [
  "CUST_NAME", "CUST_INN", "CUST_KPP", "CUST_OGRN", "CUST_LEGAL_ADDR", "CUST_POST_ADDR",
  "CUST_ACCOUNT", "CUST_BANK", "CUST_BIK", "CUST_CORR", "CUST_EMAIL", "CUST_PHONE",
  "CUST_REP_POS", "CUST_REP_GEN", "CUST_REP_SHORT", "CUST_AUTH",
];

function draft(overrides: Partial<DocxContractDraft> = {}): DocxContractDraft {
  const scalars: Record<string, string> = {};
  for (const k of COMPANY_KEYS) scalars[k] = "заполнено";
  Object.assign(scalars, {
    DOC_NO: "ДЕМО-02/2026",
    DOC_DATE: "«03» августа 2026 г.",
    TRAINING_ADDR: "Санкт-Петербург",
    SCHEDULE: "по 8 часов в день",
    PRICE_NUM: "15 000,00",
    PRICE_WORDS: "пятнадцать тысяч рублей 00 копеек",
    TAX_CLAUSE: "НДС не облагается",
    PAYMENT_CLAUSE: "5 банковских дней",
  });
  return {
    scalars,
    programs: [{ PROG_TITLE: CURRICULUM, PROG_FORM: "Очная", PROG_COUNT: "1" }],
    students: [{
      STUDENT_FIO: "Иванов Иван",
      STUDENT_EDU: "высшее",
      STUDENT_CONTACTS: "a@b.ru",
      STUDENT_POSITION: "инженер",
      STUDENT_PROGRAM: CURRICULUM,
      STUDENT_DATES: "03.08.2026 — 07.08.2026",
    }],
    curricula: [CURRICULUM],
    totalAmount: 15000,
    taxClauseChosen: true,
    ...overrides,
  };
}

describe("evaluateDocxReadiness", () => {
  it("полный черновик готов к генерации", () => {
    const groups = evaluateDocxReadiness(draft());
    expect(groups.every((g) => g.ready)).toBe(true);
    expect(isDocxDraftReady(groups)).toBe(true);
  });

  it("блокирует пустые реквизиты заказчика", () => {
    const d = draft();
    d.scalars.CUST_BIK = "";
    const groups = evaluateDocxReadiness(d);
    expect(groups.find((g) => g.id === "company")!.ready).toBe(false);
    expect(isDocxDraftReady(groups)).toBe(false);
  });

  it("блокирует отсутствие стоимости и невыбранный НДС", () => {
    const groups = evaluateDocxReadiness(draft({ totalAmount: 0, taxClauseChosen: false }));
    const payment = groups.find((g) => g.id === "payment")!;
    expect(payment.ready).toBe(false);
    expect(payment.missing.join(" ")).toMatch(/НДС/);
  });

  it("блокирует слушателя без должности и с чужой программой", () => {
    const d = draft();
    d.students[0].STUDENT_POSITION = "";
    d.students[0].STUDENT_PROGRAM = "Другая";
    const students = evaluateDocxReadiness(d).find((g) => g.id === "students")!;
    expect(students.ready).toBe(false);
    expect(students.missing.join(" ")).toMatch(/Должность/);
    expect(students.missing.join(" ")).toMatch(/не входит в договор/);
  });

  it("требует выбранные приложения и отклоняет неизвестный учебный план", () => {
    expect(evaluateDocxReadiness(draft({ curricula: [] })).find((g) => g.id === "appendices")!.ready).toBe(false);
    const unknown = evaluateDocxReadiness(draft({ curricula: ["Нет такого"] })).find((g) => g.id === "appendices")!;
    expect(unknown.missing.join(" ")).toMatch(/нет учебного плана/i);
  });

  it("ключ встроенного шаблона стабилен", () => {
    expect(GORELTECH_TEMPLATE_KEY).toBe("goreltech.company.paid_education");
  });
});

describe("изоляция HTML- и DOCX-потоков", () => {
  it("HTML-мастер по-прежнему требует свой шаблон и сценарий", () => {
    expect(canProceedStep(1, {
      step: 1, scenarioChosen: false, counterparty: "legal", hasTemplate: false,
      hasPrimaryStudent: false, multiStudentCount: 0, hasCompany: false,
    }).ok).toBe(false);
    expect(canProceedStep(2, {
      step: 2, scenarioChosen: true, counterparty: "legal", hasTemplate: false,
      hasPrimaryStudent: false, multiStudentCount: 0, hasCompany: true,
    }).ok).toBe(false);
  });

  it("готовность DOCX не зависит от HTML-шаблонов организации", () => {
    expect(isDocxDraftReady(evaluateDocxReadiness(draft()))).toBe(true);
  });
});
