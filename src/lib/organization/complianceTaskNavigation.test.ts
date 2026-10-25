import { describe, expect, it } from "vitest";
import { compliancePreparation, groupDocumentSelectionPath, isGroupDocumentTask, readCompliancePreparation } from './complianceTaskNavigation.ts';
import { readConstructorView, setConstructorViewParams, setDocumentViewParams } from './documentWorkspaceNavigation.ts';

const paramsOf = (href: string) => new URLSearchParams(href.split("?")[1]);

describe("UC029 existing task destinations and constructor context", () => {
  it("opens the existing group selector without inventing a group or a duplicate organization file", () => {
    const params = paramsOf(groupDocumentSelectionPath());
    expect(params.get("tab")).toBe("students");
    expect(params.get("studentsView")).toBe("groups");
    expect(params.has("groupId")).toBe(false);
    expect(params.has("documentView")).toBe(false);
    expect(isGroupDocumentTask("enrollment_order")).toBe(true);
    expect(isGroupDocumentTask("expulsion_order")).toBe(true);
    expect(isGroupDocumentTask("attestation_protocol")).toBe(true);
    expect(isGroupDocumentTask("certificate_qualification")).toBe(false);
  });

  it("keeps a supported task in its actual existing editor after a URL reload", () => {
    for (const [requirement, view] of [
      ["paid_services", "contract"], ["personal_data", "consent"],
      ["attestation_protocol", "protocol"], ["qualification_issuance", "documents"],
      ["doc_forms_approval", "documents"],
    ]) {
      const tool = compliancePreparation(requirement)!;
      const reloaded = new URLSearchParams(paramsOf(tool.href).toString());
      expect(reloaded.get("tab")).toBe("documents");
      expect(reloaded.get("documentView")).toBe("constructor");
      expect(readConstructorView(reloaded)).toBe(view);
      expect(readCompliancePreparation(reloaded)?.label).toBe(tool.label);
    }
  });

  it("does not advertise an invented LNA, charter or license editor", () => {
    for (const id of ["charter", "license", "registration", "admission_rules", "self_examination_report", "unknown", "__proto__"]) {
      expect(compliancePreparation(id)).toBeNull();
    }
  });

  it("does not attach the old task explanation to another editor or workspace", () => {
    const params = paramsOf(compliancePreparation("personal_data")!.href);
    params.set("constructorView", "documents");
    expect(readCompliancePreparation(params)).toBeNull();
    params.set("constructorView", "consent"); params.set("tab", "students");
    expect(readCompliancePreparation(params)).toBeNull();
  });

  it("a manual constructor tab change clears the task context and stale journal focus", () => {
    const current = paramsOf(compliancePreparation("personal_data")!.href);
    current.set("journal", "education_documents"); current.set("educationRecordId", "old-record"); current.set("educationEnrollmentId", "old-enrollment");
    const next = setConstructorViewParams(current, "protocol");
    expect(readConstructorView(next)).toBe("protocol");
    expect(next.has("documentRequirement")).toBe(false);
    expect(next.has("educationRecordId")).toBe(false);
    expect(next.has("educationEnrollmentId")).toBe(false);
    expect(current.get("documentRequirement")).toBe("personal_data");
  });

  it("leaving the constructor or returning to the hub clears its nested task state", () => {
    const original = paramsOf(compliancePreparation("paid_services")!.href);
    for (const target of ["org", null] as const) {
      const next = setDocumentViewParams(original, target);
      expect(next.has("constructorView")).toBe(false);
      expect(next.has("documentRequirement")).toBe(false);
    }
  });

  it("an unknown constructor view cannot restore an arbitrary tab", () => {
    const params = paramsOf(compliancePreparation("personal_data")!.href);
    params.set("constructorView", "javascript:alert(1)");
    expect(readConstructorView(params)).toBe("requisites");
    expect(readCompliancePreparation(params)).toBeNull();
  });
});
