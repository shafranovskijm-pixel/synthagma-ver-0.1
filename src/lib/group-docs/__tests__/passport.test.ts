import { describe, it, expect } from "vitest";
import { resolvePassport, passportString } from "../variables";

describe("resolvePassport", () => {
  it("предпочитает структурированные поля", () => {
    expect(resolvePassport({ passport_series: "4010", passport_number: "123456" })).toEqual({
      series: "4010",
      number: "123456",
    });
  });

  it("разбирает «40 10 123456»", () => {
    expect(resolvePassport({ passport: "40 10 123456" })).toEqual({ series: "4010", number: "123456" });
  });

  it("разбирает формат «серия ... номер ...»", () => {
    expect(resolvePassport({ passport: "серия 40 10 номер 123456" })).toEqual({
      series: "4010",
      number: "123456",
    });
  });

  it("собирает строку паспорта", () => {
    expect(passportString({ passport: "4010 123456" })).toBe("4010 123456");
  });
});
