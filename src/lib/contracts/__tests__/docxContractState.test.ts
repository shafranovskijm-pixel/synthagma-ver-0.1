/** Регрессии hardening-прохода: сброс компании, повторное открытие, дата, автозаполнение группы. */
import { describe, expect, it } from "vitest";
import {
  COMPANY_SCOPED_KEYS,
  applyCompanySelection,
  companyScalars,
  formatContractDateRu,
  groupDatesText,
  groupScheduleText,
  initialDocxScalars,
  DEFAULT_PAYMENT_CLAUSE,
} from "../docxContract";

const A = {
  id: "a", name: "ООО А", inn: "111", kpp: "222", ogrn: "333",
  address: "г. Москва, ул. А", email: "a@a.ru", director: "Иванов Иван Иванович",
};
const B = { id: "b", name: "ООО Б", inn: "999" };

describe("смена компании", () => {
  it("полностью заменяет реквизиты предыдущего заказчика", () => {
    const first = applyCompanySelection(initialDocxScalars(null, "2026-08-03"), A);
    expect(first.CUST_INN).toBe("111");
    expect(first.CUST_REP_SHORT).toBe("Иванов И. И.");

    const second = applyCompanySelection(first, B);
    expect(second.CUST_NAME).toBe("ООО Б");
    expect(second.CUST_INN).toBe("999");
    // ни одно значение компании А не осталось

    expect(second.CUST_KPP).toBe("");
    expect(second.CUST_OGRN).toBe("");
    expect(second.CUST_LEGAL_ADDR).toBe("");
    expect(second.CUST_POST_ADDR).toBe("");
    expect(second.CUST_EMAIL).toBe("");
    expect(second.CUST_REP_SHORT).toBe("");
    expect(second.CUST_AUTH).toBe("");
  });

  it("сохраняет поля договора и группы, не относящиеся к компании", () => {
    const base = { ...initialDocxScalars({ group_number: "Д-7", program_form: "Очная" }, "2026-08-03"), TRAINING_ADDR: "СПб" };
    const next = applyCompanySelection(base, A);
    expect(next.DOC_NO).toBe("Д-7");
    expect(next.TRAINING_ADDR).toBe("СПб");
    expect(next.PAYMENT_CLAUSE).toBe(DEFAULT_PAYMENT_CLAUSE);
  });

  it("companyScalars всегда возвращает все ключи компании", () => {
    const empty = companyScalars(null);
    expect(Object.keys(empty).sort()).toEqual([...COMPANY_SCOPED_KEYS].sort());
    expect(Object.values(empty).every((v) => v === "")).toBe(true);
  });
});

describe("повторное открытие диалога", () => {
  it("начальное состояние не содержит данных предыдущего договора", () => {
    const dirty = applyCompanySelection(
      { ...initialDocxScalars({ group_number: "Д-1" }, "2026-08-03"), TRAINING_ADDR: "Москва", TAX_CLAUSE: "НДС 20%" },
      A,
    );
    const fresh = initialDocxScalars({ group_number: "Д-2", program_form: "Заочная" }, "2026-09-01");
    expect(dirty.CUST_NAME).toBe("ООО А");
    expect(fresh.CUST_NAME).toBe("");
    expect(fresh.TAX_CLAUSE).toBe("");
    expect(fresh.TRAINING_ADDR).toBe("");
    expect(fresh.DOC_NO).toBe("Д-2");
  });
});

describe("дата договора", () => {
  it("русский текст выводится строго из ISO-даты", () => {
    expect(formatContractDateRu("2026-08-03")).toBe("«03» августа 2026 г.");
    expect(formatContractDateRu("2026-01-15")).toBe("«15» января 2026 г.");
    expect(formatContractDateRu("")).toBe("");
  });

  it("одно состояние даты — DOC_DATE и хранимая дата не расходятся", () => {
    const iso = "2026-12-01";
    const scalars = initialDocxScalars(null, iso);
    expect(scalars.DOC_DATE).toBe(formatContractDateRu(iso));
    // при смене компании дата не теряется
    expect(applyCompanySelection(scalars, A).DOC_DATE).toBe(formatContractDateRu(iso));
  });
});

describe("автозаполнение из группы", () => {
  it("даты обучения берутся из дат группы", () => {
    expect(groupDatesText("2026-08-03", "2026-08-07")).toBe("03.08.2026 — 07.08.2026");
    expect(groupDatesText("2026-08-03", null)).toBe("03.08.2026");
    expect(groupDatesText(null, null)).toBe("");
  });

  it("режим занятий собирается из формы и объёма часов", () => {
    expect(groupScheduleText({ program_form: "Очная", program_hours: 32 })).toBe("Форма обучения: Очная, объём 32 ч.");
    expect(groupScheduleText({})).toBe("");
  });

  it("initialDocxScalars подставляет номер, форму и даты группы", () => {
    const s = initialDocxScalars(
      { group_number: "ДЕМО-02/2026", program_form: "Очная", program_hours: 32, start_date: "2026-08-03", end_date: "2026-08-07" },
      "2026-08-03",
    );
    expect(s.DOC_NO).toBe("ДЕМО-02/2026");
    expect(s.PROG_FORM).toBe("Очная");
    expect(s.STUDENT_DATES).toBe("03.08.2026 — 07.08.2026");
    expect(s.SCHEDULE).toBe("Форма обучения: Очная, объём 32 ч.");
    // место обучения в группе не хранится — остаётся явной ошибкой готовности
    expect(s.TRAINING_ADDR).toBe("");
  });
});

describe("источники истины Синтагмы", () => {
  it("реквизиты компании подставляются из карточки компании", () => {
    const s = companyScalars({
      name: "ООО Тест", inn: "1", address: "юр", postal_address: "почт",
      phone: "+7", bank_name: "Банк", bank_account: "40702", bank_bik: "0445",
      bank_corr_account: "30101", signatory_position: "Директор",
      signatory_name_genitive: "Иванова И.И.", signatory_authority_clause: "Уставе",
      director: "Иванов Иван Иванович",
    });
    expect(s.CUST_POST_ADDR).toBe("почт");
    expect(s.CUST_BANK).toBe("Банк");
    expect(s.CUST_ACCOUNT).toBe("40702");
    expect(s.CUST_BIK).toBe("0445");
    expect(s.CUST_CORR).toBe("30101");
    expect(s.CUST_PHONE).toBe("+7");
    expect(s.CUST_REP_POS).toBe("Директор");
    expect(s.CUST_REP_GEN).toBe("Иванова И.И.");
    expect(s.CUST_AUTH).toBe("Уставе");
    expect(s.CUST_REP_SHORT).toBe("Иванов И. И.");
  });

  it("почтовый адрес падает обратно на юридический", () => {
    expect(companyScalars({ address: "юр" }).CUST_POST_ADDR).toBe("юр");
  });

  it("место обучения и режим занятий берутся из группы", () => {
    const sc = initialDocxScalars(
      { training_address: "г. Москва, ул. 1", schedule_text: "Пн–Пт 10:00–17:00", program_form: "Очная" },
      "2026-08-03",
    );
    expect(sc.TRAINING_ADDR).toBe("г. Москва, ул. 1");
    expect(sc.SCHEDULE).toBe("Пн–Пт 10:00–17:00");
  });

  it("номер договора не берётся из номера группы", () => {
    expect(initialDocxScalars({ group_number: "УЦ-4/2026" }, "2026-08-03").DOC_NO).toBe("");
  });

  it("учебный план сопоставляется с программой группы", () => {
    expect(matchGroupCurriculum(GORELTECH_CURRICULA[0])).toBe(GORELTECH_CURRICULA[0]);
    expect(matchGroupCurriculum("Неизвестная программа")).toBeNull();
    expect(matchGroupCurriculum("")).toBeNull();
  });

  it("строка слушателя собирается только из данных Синтагмы", () => {
    const row = studentRowFromSources({
      user_id: "u1",
      full_name: "Петров Пётр",
      email: "p@x.ru",
      profile: { phone: "+7999", region: "Москва", city: "Москва", job_position: "Инженер" },
      frdo: { education_level: "среднее профессиональное" },
      program: GORELTECH_CURRICULA[1],
    });
    expect(row.contacts).toBe("p@x.ru, +7999");
    expect(row.position).toBe("Инженер");
    expect(row.edu).toBe("среднее профессиональное");
    expect(row.program).toBe(GORELTECH_CURRICULA[1]);
  });

  it("образование не придумывается, если данных ФРДО нет", () => {
    expect(studentRowFromSources({ user_id: "u2", full_name: "А" }).edu).toBe("");
  });
});
