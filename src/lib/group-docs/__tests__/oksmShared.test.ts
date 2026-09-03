import { describe, expect, it } from "vitest";
import {
  OKSM_BY_CODE, OKSM_COUNTRIES, getOksmName, type OksmCountry,
} from "../../../constants/oksm";
import {
  OKSM_BY_CODE as sharedByCode,
  OKSM_COUNTRIES as sharedCountries,
  getOksmName as sharedName,
  type OksmCountry as SharedCountry,
} from "../../../../supabase/functions/_shared/oksm";

describe("one retained OKSM catalogue for browser and server", () => {
  it("preserves the old public API and shares objects/functions without a duplicate catalogue", () => {
    expect(OKSM_COUNTRIES).toBe(sharedCountries);
    expect(OKSM_BY_CODE).toBe(sharedByCode);
    expect(getOksmName).toBe(sharedName);
    const compatible: OksmCountry = sharedCountries[0] satisfies SharedCountry;
    expect(compatible).toBe(OKSM_COUNTRIES[0]);
  });

  it("returns exactly the same stored names for every retained country code", () => {
    for (const country of OKSM_COUNTRIES) {
      expect(sharedName(country.code)).toBe(country.name);
      expect(getOksmName(country.code)).toBe(country.name);
      expect(sharedByCode[country.code]).toBe(country);
    }
  });

  it.each([
    ["643", "Россия"], ["036", "Австралия"], ["36", "Австралия"],
    ["999", "999"], ["unknown-code", "unknown-code"], [null, ""], [undefined, ""], ["", ""],
  ])("preserves original lookup and fallback for %s", (code, expected) => {
    expect(sharedName(code)).toBe(expected);
    expect(getOksmName(code)).toBe(expected);
  });
});
