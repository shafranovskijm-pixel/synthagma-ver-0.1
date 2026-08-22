import { describe, expect, it, vi } from "vitest";
import {
  canAccessDocumentSubTab,
  getDirectDocumentWorkspacePermission,
  getDocumentSubTabPermission,
} from "@/lib/organization/documentNavigationPermissions";

describe("documentNavigationPermissions", () => {
  it("requires the dedicated permission for Journals and FRDO", () => {
    expect(getDocumentSubTabPermission("journals")).toBe("journals.read");
    expect(getDocumentSubTabPermission("frdo")).toBe("frdo.read");
  });

  it("keeps ordinary document subsections under documents.read", () => {
    for (const tab of [
      "kpi",
      "programs",
      "orders",
      "certificates",
      "org",
      "counterparties",
      "incoming",
    ]) {
      expect(getDocumentSubTabPermission(tab)).toBe("documents.read");
    }
  });

  it("does not let documents.read substitute for journals.read or frdo.read", () => {
    const can = vi.fn((permission: string) => permission === "documents.read");

    expect(canAccessDocumentSubTab("certificates", can)).toBe(true);
    expect(canAccessDocumentSubTab("journals", can)).toBe(false);
    expect(canAccessDocumentSubTab("frdo", can)).toBe(false);
  });

  it("gates only the four directly routable document workspaces", () => {
    expect(getDirectDocumentWorkspacePermission("documents")).toBe("documents.read");
    expect(getDirectDocumentWorkspacePermission("org-documents")).toBe("documents.read");
    expect(getDirectDocumentWorkspacePermission("journals")).toBe("journals.read");
    expect(getDirectDocumentWorkspacePermission("frdo")).toBe("frdo.read");
    expect(getDirectDocumentWorkspacePermission("contract-editor")).toBe("settings.write");
    expect(getDirectDocumentWorkspacePermission("courses")).toBeNull();
    expect(getDirectDocumentWorkspacePermission("sales")).toBeNull();
  });
});
