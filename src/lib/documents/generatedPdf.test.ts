import { describe, expect, it } from "vitest";
import { generatedPdfPath } from "./generatedPdf";

describe("generated document proof", () => {
  it.each([null, {}, { success: true, renderer: "fallback", path: "org/contract.pdf" },
    { success: false, renderer: "browserless", path: "org/contract.pdf" },
    { success: true, renderer: "browserless", path: "" }])("does not register incomplete output %j", result => {
    expect(() => generatedPdfPath(result)).toThrow("Документ не зарегистрирован");
  });
  it("returns the stored faithful renderer result", () => {
    expect(generatedPdfPath({ success: true, renderer: "browserless", path: "org/contracts/new.pdf" })).toBe("org/contracts/new.pdf");
  });
});
