import { describe, expect, it } from "vitest";
import {
  readCounterpartyView,
  readDocumentView,
  setDocumentViewParams,
} from "./documentWorkspaceNavigation";

describe("document workspace URL state", () => {
  it("uses the documents URL without documentView as the hub", () => {
    expect(readDocumentView(new URLSearchParams("tab=documents"))).toBeNull();
  });

  it("round-trips a selected workspace across reload", () => {
    const next = setDocumentViewParams(new URLSearchParams("tab=documents"), "programs");

    expect(next.toString()).toContain("documentView=programs");
    expect(readDocumentView(new URLSearchParams(next.toString()))).toBe("programs");
  });

  it("keeps the counterparty subsection in the URL and clears it outside counterparties", () => {
    const invoices = setDocumentViewParams(
      new URLSearchParams("tab=documents"),
      "counterparties",
      "invoices",
    );

    expect(readDocumentView(invoices)).toBe("counterparties");
    expect(readCounterpartyView(invoices)).toBe("invoices");

    const journals = setDocumentViewParams(invoices, "journals");
    expect(journals.get("counterpartyView")).toBeNull();
  });

  it("removes nested state when returning to the hub", () => {
    const hub = setDocumentViewParams(
      new URLSearchParams("tab=documents&documentView=counterparties&counterpartyView=closing"),
      null,
    );

    expect(hub.get("tab")).toBe("documents");
    expect(hub.get("documentView")).toBeNull();
    expect(hub.get("counterpartyView")).toBeNull();
  });
});
