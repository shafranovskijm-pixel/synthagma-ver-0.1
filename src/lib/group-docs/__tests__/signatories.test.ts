import { describe, expect, it } from "vitest";
import { SAMPLE_CONTEXT } from "../sampleContext";
import {
  defaultGoreltechGroupDocumentSignatories,
  defaultGroupDocumentSignatories,
  hasBlankGroupDocumentSignatory,
  signatoriesToGenerationExtras,
} from "../signatories";
import { buildVariables } from "../variables";

describe("group document signatories", () => {
  it("uses the organization manager as a visible default without hardcoding a title", () => {
    const ctx = structuredClone(SAMPLE_CONTEXT);
    ctx.organization.director_position = "Руководитель учебного центра";
    ctx.organization.director_name = "Ляпко Дарья Константиновна";

    const defaults = defaultGroupDocumentSignatories({
      position: ctx.organization.director_position,
      name: ctx.organization.director_name,
    });

    expect(defaults.enrollment_order).toEqual({
      position: "Руководитель учебного центра",
      name: "Ляпко Дарья Константиновна",
    });
    expect(defaults.class_journal).toEqual(defaults.enrollment_order);
  });

  it("keeps explicit blank signer fields for manual completion", () => {
    const extras = signatoriesToGenerationExtras({
      enrollment_order: { position: "", name: "" },
    });
    const ctx = structuredClone(SAMPLE_CONTEXT);
    ctx.extras = extras;

    const vars = buildVariables(ctx, { docType: "enrollment_order" });

    expect(vars.signatory_position).toBe("");
    expect(vars.signatory_name).toBe("");
    expect(vars.signatory_short).toBe("");
    expect(hasBlankGroupDocumentSignatory({
      enrollment_order: { position: "", name: "" },
    })).toBe(true);
  });

  it("does not require blank confirmation when every signer is filled", () => {
    const defaults = defaultGroupDocumentSignatories({
      position: "Руководитель учебного центра",
      name: "Ляпко Дарья Константиновна",
    });
    expect(hasBlankGroupDocumentSignatory(defaults)).toBe(false);
  });

  it("uses the exact GORELTECH source map without inventing blank signers", () => {
    const defaults = defaultGoreltechGroupDocumentSignatories({
      position: "Руководитель учебного центра",
      name: "Дроздов Дмитрий Викторович",
    });

    expect(defaults.enrollment_order).toEqual({
      position: "Руководитель учебного центра",
      name: "",
    });
    expect(defaults.class_journal).toEqual({
      position: "Руководитель учебного центра",
      name: "Дроздов Дмитрий Викторович",
    });
    expect(defaults.pass).toEqual({ position: "", name: "" });
    expect(hasBlankGroupDocumentSignatory(defaults)).toBe(true);
  });

  it("does not invent a signer title when the organization left it empty", () => {
    const ctx = structuredClone(SAMPLE_CONTEXT);
    ctx.organization.director_position = "";

    const vars = buildVariables(ctx, { docType: "enrollment_order" });

    expect(vars.signatory_position).toBe("");
  });

  it("selects signers independently for each document", () => {
    const ctx = structuredClone(SAMPLE_CONTEXT);
    ctx.extras = signatoriesToGenerationExtras({
      enrollment_order: {
        position: "Генеральный директор",
        name: "Дроздов Дмитрий Викторович",
      },
      class_journal: {
        position: "Руководитель учебного центра",
        name: "Ляпко Дарья Константиновна",
      },
    });

    expect(buildVariables(ctx, { docType: "enrollment_order" })).toMatchObject({
      signatory_position: "Генеральный директор",
      signatory_short: "Д.В. Дроздов",
    });
    expect(buildVariables(ctx, { docType: "class_journal" })).toMatchObject({
      signatory_position: "Руководитель учебного центра",
      signatory_short: "Д.К. Ляпко",
    });
  });
});
