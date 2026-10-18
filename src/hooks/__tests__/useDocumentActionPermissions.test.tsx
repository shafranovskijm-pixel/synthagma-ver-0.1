import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentActionPermissions } from "../useDocumentActionPermissions";
import { computeOrgPermissions, ORG_ROLE_PERMISSIONS } from "@/constants/rolePermissions";

const { state } = vi.hoisted(() => ({ state: { loading: false, error: null as string | null, organizationId: "org" as string | null,
  isOrgOwner: false, adminRole: null as string | null, orgPermissions: new Set<string>() } }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ ...state, can: (key: string) => state.orgPermissions.has(key) }) }));
describe("separate document actions", () => {
  beforeEach(() => { Object.assign(state, { loading: false, error: null, organizationId: "org", isOrgOwner: false, adminRole: null, orgPermissions: new Set(["documents.read", "documents.write"]) }); });
  it("does not infer sign or issue from write", () => {
    const { result } = renderHook(() => useDocumentActionPermissions("org"));
    expect(result.current).toMatchObject({ canWrite: true, canSign: false, canIssue: false });
  });
  it("an explicit issue grant does not imply sign or write", () => {
    state.orgPermissions = new Set(["documents.issue"]);
    const { result } = renderHook(() => useDocumentActionPermissions("org"));
    expect(result.current).toMatchObject({ canWrite: false, canSign: false, canIssue: true });
  });
  it.each([{ loading: true }, { error: "denied" }, { organizationId: "other" }, { organizationId: null }])("fails closed for unresolved or foreign workspace %j", changes => {
    Object.assign(state, changes); state.orgPermissions.add("documents.issue");
    expect(renderHook(() => useDocumentActionPermissions("org")).result.current.canIssue).toBe(false);
  });
  it("allows a resolved platform admin for the selected organization", () => {
    Object.assign(state, { organizationId: null, isOrgOwner: true, orgPermissions: new Set(ORG_ROLE_PERMISSIONS.owner) });
    expect(renderHook(() => useDocumentActionPermissions("org")).result.current.canIssue).toBe(true);
  });
  it.each(["viewer", "sales_manager"])("does not inherit platform owner document actions for %s", adminRole => {
    Object.assign(state, { organizationId: null, isOrgOwner: true, adminRole, orgPermissions: new Set(ORG_ROLE_PERMISSIONS.owner) });
    const { result } = renderHook(() => useDocumentActionPermissions("org"));
    expect(result.current.canIssue).toBe(false); expect(result.current.canSign).toBe(false);
    expect(result.current.canSalesWrite).toBe(adminRole === "sales_manager");
  });
  it("only owner/admin roles receive new actions by default; personal grants are independent", () => {
    for (const [role, permissions] of Object.entries(ORG_ROLE_PERMISSIONS)) {
      expect(permissions.includes("documents.sign")).toBe(["owner", "admin"].includes(role));
      expect(permissions.includes("documents.issue")).toBe(["owner", "admin"].includes(role));
    }
    expect(computeOrgPermissions("teacher", ["documents.issue"]).has("documents.issue")).toBe(true);
    expect(computeOrgPermissions("teacher", ["documents.write"]).has("documents.issue")).toBe(false);
  });
});
