import { describe, it, expect } from "vitest";
import {
  templateMatchesScenario,
  pickDefaultTemplate,
  validateScenario,
  blockingMissing,
  planContractJobs,
  type ScenarioInput,
} from "@/lib/contracts/scenarios";

const org = { name: "УЦ", inn: "123", legal_address: "Москва", director_name: "Иванов И.И." };
const students = [
  { user_id: "u1", full_name: "Петров Пётр", passport: "4010 123456" },
  { user_id: "u2", full_name: "Сидоров Сидор", passport: null },
];
const base: ScenarioInput = {
  org,
  students,
  programTitle: "Электробезопасность",
  price: "5000",
  templateId: "t1",
};

describe("contract scenarios", () => {
  it("матчит шаблоны по сценарию", () => {
    expect(templateMatchesScenario("any", "individual")).toBe(true);
    expect(templateMatchesScenario(null, "legal")).toBe(true);
    expect(templateMatchesScenario("legal", "individual")).toBe(false);
    expect(templateMatchesScenario("individual", "individual")).toBe(true);
  });

  it("выбирает шаблон по умолчанию с приоритетом сценария", () => {
    const tpls = [
      { id: "a", is_default: true, counterparty_type: "any" },
      { id: "b", is_default: true, counterparty_type: "individual" },
      { id: "c", is_default: false, counterparty_type: "legal" },
    ];
    expect(pickDefaultTemplate(tpls, "individual")?.id).toBe("b");
    expect(pickDefaultTemplate(tpls, "legal")?.id).toBe("a");
    expect(pickDefaultTemplate([tpls[2]], "individual")).toBeUndefined();
  });

  it("физлица: паспорт — некритичное предупреждение", () => {
    const missing = validateScenario("individual", base);
    expect(blockingMissing(missing)).toHaveLength(0);
    expect(missing.map(m => m.key)).toContain("student_u2_passport");
  });

  it("физлица: без шаблона и учеников генерация блокируется", () => {
    const missing = validateScenario("individual", { ...base, templateId: "", students: [] });
    const keys = blockingMissing(missing).map(m => m.key);
    expect(keys).toContain("template");
    expect(keys).toContain("students");
  });

  it("компания: требуются название, ИНН, адрес и подписант заказчика", () => {
    const noCompany = blockingMissing(validateScenario("legal", base)).map(m => m.key);
    expect(noCompany).toContain("company");

    const badInn = blockingMissing(
      validateScenario("legal", { ...base, company: { id: "c1", name: "ООО Ромашка", inn: "" } }),
    ).map(m => m.key);
    expect(badInn).toContain("company_inn");

    // Адрес и подписант компании — тоже blocking (второй проход).
    const partial = blockingMissing(
      validateScenario("legal", { ...base, company: { id: "c1", name: "ООО Ромашка", inn: "7701" } }),
    ).map(m => m.key);
    expect(partial).toEqual(expect.arrayContaining(["company_address", "company_director"]));

    const ok = blockingMissing(
      validateScenario("legal", {
        ...base,
        company: {
          id: "c1",
          name: "ООО Ромашка",
          inn: "7701",
          address: "г. Москва, ул. Ленина, 1",
          director: "Иванов И.И.",
        },
      }),
    );
    expect(ok).toHaveLength(0);
  });

  it("реквизиты учебного центра обязательны", () => {
    const keys = blockingMissing(validateScenario("individual", { ...base, org: { name: "УЦ" } })).map(m => m.key);
    expect(keys).toEqual(expect.arrayContaining(["org_inn", "org_legal_address", "org_director_name"]));
  });

  it("физлица: один договор на каждого ученика", () => {
    const jobs = planContractJobs("individual", base);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].studentUserId).toBe("u1");
    expect(jobs[0].students).toHaveLength(1);
    expect(jobs[1].label).toContain("Сидоров");
  });

  it("компания: один договор со всеми слушателями", () => {
    const jobs = planContractJobs("legal", { ...base, company: { id: "c1", name: "ООО Ромашка", inn: "7701" } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].companyId).toBe("c1");
    expect(jobs[0].studentUserId).toBeNull();
    expect(jobs[0].students).toHaveLength(2);
  });
});
