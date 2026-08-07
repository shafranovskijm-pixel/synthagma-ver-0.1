import { describe, expect, it } from "vitest";
import { resolveEducationDocumentType } from "@/lib/education-docs/documentType";

describe("resolveEducationDocumentType", () => {
  it("keeps a Russian FRDO label but returns the database certificate code", () => {
    expect(resolveEducationDocumentType({
      rawType: "Удостоверение о повышении квалификации",
      exportType: "dpo",
    })).toEqual({
      recordType: "certificate",
      frdoLabel: "Удостоверение о повышении квалификации",
    });
  });

  it("uses a diploma for professional retraining", () => {
    expect(resolveEducationDocumentType({ exportType: "dpo", programType: "professional_retraining" }))
      .toEqual({ recordType: "diploma", frdoLabel: "Диплом о профессиональной переподготовке" });
  });

  it("uses the qualification code for professional training", () => {
    expect(resolveEducationDocumentType({ exportType: "po", rawType: "qualification" }))
      .toEqual({
        recordType: "qualification",
        frdoLabel: "Свидетельство о профессии рабочего, должности служащего",
      });
  });
});
