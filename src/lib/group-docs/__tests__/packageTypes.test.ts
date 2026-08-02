import { describe, it, expect } from "vitest";
import {
  PACKAGE_DOC_TYPES,
  buildPackageDocTypes,
  describePackagePlan,
  packageResultMessage,
  shouldGeneratePackageDocs,
} from "../packageTypes";

describe("group docs package", () => {
  it("не содержит contract", () => {
    expect(PACKAGE_DOC_TYPES).not.toContain("contract");
  });

  it("каждый doc_type встречается ровно один раз", () => {
    expect(new Set(PACKAGE_DOC_TYPES).size).toBe(PACKAGE_DOC_TYPES.length);
  });

  it("содержит 9 документов группы", () => {
    expect(PACKAGE_DOC_TYPES.length).toBe(9);
    expect(buildPackageDocTypes()).toEqual(PACKAGE_DOC_TYPES);
  });

  it("честно описывает план для физлица и компании", () => {
    expect(describePackagePlan("individual", 3)).toBe("3 договор(ов) + 9 документов группы");
    expect(describePackagePlan("company", 3)).toBe("1 договор + 9 документов группы");
  });

  it("итоговый toast отражает сценарий", () => {
    expect(packageResultMessage("individual", 3, 9)).toContain("договоров: 3");
    expect(packageResultMessage("company", 1, 9)).toContain("договор: 1");
  });

  it("документы не генерируются без успешных договоров и только один раз", () => {
    expect(shouldGeneratePackageDocs({ contractsDone: false, contractCount: 0, docsGenerated: false })).toBe(false);
    expect(shouldGeneratePackageDocs({ contractsDone: true, contractCount: 0, docsGenerated: false })).toBe(false);
    expect(shouldGeneratePackageDocs({ contractsDone: true, contractCount: 2, docsGenerated: false })).toBe(true);
    expect(shouldGeneratePackageDocs({ contractsDone: true, contractCount: 2, docsGenerated: true })).toBe(false);
  });
});
