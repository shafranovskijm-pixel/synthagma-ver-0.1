import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPERATOR_REQUISITES,
  readStoredCompanyCardRequisites,
} from "@/constants/operatorDetails";
import { generatePdfHtml, prepareCompanyCardData } from "../../../supabase/functions/generate-company-card/company-card";

const saved = { ...DEFAULT_OPERATOR_REQUISITES };
const company = {
  inn: saved.inn,
  ogrnip: saved.ogrnip,
  fullName: saved.fullName,
  birthDate: "25.10.1988",
  email: "24@24zxc.ru",
  domain: "sintagma.com.ru",
  address: saved.address,
};

describe("company card uses saved current operator bank", () => {
  it("ignores banking fields supplied by an outdated caller in the actual export", () => {
    const oldAccount = "40914810200040551529";
    const resolved = prepareCompanyCardData({
      ...company,
      account1: oldAccount,
      account2: oldAccount,
      bankAccount: oldAccount,
      bankName: "Банк из старого браузера",
      bik: "000000000",
      corrAccount: "00000000000000000000",
    }, JSON.stringify(saved));
    const html = generatePdfHtml(resolved);

    expect(resolved.bankAccount).toBe(saved.bankAccount);
    expect(resolved.bankName).toBe(saved.bankName);
    expect(resolved.bik).toBe(saved.bik);
    expect(resolved.corrAccount).toBe(saved.corrAccount);
    expect(html).toContain(saved.bankAccount);
    expect(html).not.toContain(oldAccount);
    expect(html).not.toContain("Банк из старого браузера");
    expect(html).not.toContain("Расчётный счёт №");
    expect(html.match(/>Расчётный счёт</g)).toHaveLength(1);
    expect(resolved.address).toBe(company.address);
    expect(resolved.email).toBe(company.email);
  });

  it.each(["40914810200040551529", "40914 810 2 0000 3058331"])("blocks retired stored operator account %s", (account) => {
    expect(() => prepareCompanyCardData(company, JSON.stringify({ ...saved, bankAccount: account }))).toThrow("Старый расчётный счёт 409");
  });

  it("does not infer default bank data when the saved record is missing", () => {
    expect(() => readStoredCompanyCardRequisites(null)).toThrow("не сохранены");
  });

  it("does not mix missing stored bank fields with defaults", () => {
    const { corrAccount: _corr, ...incomplete } = saved;
    expect(() => readStoredCompanyCardRequisites(JSON.stringify(incomplete))).toThrow("Банковские реквизиты оператора не заполнены");
  });

  it("follows a changed saved record without using browser bank fields", () => {
    const next = { ...saved, bankAccount: "40802810200000522080", bankName: "Сохранённый тестовый банк" };
    const resolved = prepareCompanyCardData(company, JSON.stringify(next));
    expect(resolved.bankAccount).toBe(next.bankAccount);
    expect(resolved.bankName).toBe(next.bankName);
  });

  it("rejects malformed saved data", () => {
    expect(() => readStoredCompanyCardRequisites("not-json")).toThrow("Не удалось прочитать");
  });
  it.each([{ bik: "0445" }, { corrAccount: "30101" }])("rejects incomplete bank numbers rather than mixing defaults", change => {
    expect(() => readStoredCompanyCardRequisites({ ...saved, ...change })).toThrow("некорректный БИК или корреспондентский счёт");
  });
});
