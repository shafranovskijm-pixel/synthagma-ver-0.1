import { describe, expect, it } from "vitest";
import {
  educationDocumentsJournalPath,
  isEducationDocumentRecordForFocus,
  readCounterpartyView,
  readDocumentView,
  readEducationDocumentsJournalFocus,
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

  it("creates and reads an exact education-document journal target", () => {
    const path = educationDocumentsJournalPath({
      enrollmentId: "enrollment 1",
      recordId: "record/1",
    });
    const params = new URLSearchParams(path.split("?")[1]);

    expect(params.get("tab")).toBe("documents");
    expect(readDocumentView(params)).toBe("journals");
    expect(readEducationDocumentsJournalFocus(params)).toEqual({
      enrollmentId: "enrollment 1",
      recordId: "record/1",
    });
  });

  it("keeps journal focus only inside the journals workspace", () => {
    const focused = new URLSearchParams(
      "tab=documents&documentView=journals&journal=education_documents&educationEnrollmentId=enr-1&educationRecordId=rec-1",
    );

    expect(setDocumentViewParams(focused, "journals").get("educationRecordId")).toBe("rec-1");
    const programs = setDocumentViewParams(focused, "programs");
    expect(programs.get("journal")).toBeNull();
    expect(programs.get("educationEnrollmentId")).toBeNull();
    expect(programs.get("educationRecordId")).toBeNull();
  });

  it("matches a focused record only when record and enrollment belong together", () => {
    const focus = { enrollmentId: "enr-1", recordId: "rec-1" };

    expect(isEducationDocumentRecordForFocus(
      { id: "rec-1", enrollment_id: "enr-1" },
      focus,
    )).toBe(true);
    expect(isEducationDocumentRecordForFocus(
      { id: "rec-1", enrollment_id: "enr-2" },
      focus,
    )).toBe(false);
    expect(isEducationDocumentRecordForFocus(
      { id: "rec-2", enrollment_id: "enr-1" },
      focus,
    )).toBe(false);
  });
});
