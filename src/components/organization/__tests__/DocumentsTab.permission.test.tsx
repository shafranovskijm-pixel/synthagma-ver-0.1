import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let permissionLoading = false;
let granted = new Set<string>();
const useDocumentsTabMock = vi.fn();

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: permissionLoading,
    can: (permission: string) => granted.has(permission),
    canSeeOrgTab: () => true,
  }),
}));

vi.mock("@/hooks/useDocumentsTab", () => ({
  useDocumentsTab: (...args: unknown[]) => useDocumentsTabMock(...args),
}));

import { DocumentsTab } from "@/components/organization/tabs/DocumentsTab";

beforeEach(() => {
  permissionLoading = false;
  granted = new Set();
  useDocumentsTabMock.mockReset();
});

describe("DocumentsTab permission boundary", () => {
  it("does not mount document data hooks without documents.read", () => {
    render(<DocumentsTab organizationId="org-1" />);

    expect(screen.getByTestId("documents-permission-denied")).toBeInTheDocument();
    expect(useDocumentsTabMock).not.toHaveBeenCalled();
  });

  it("waits for permissions before mounting document data hooks", () => {
    permissionLoading = true;
    render(<DocumentsTab organizationId="org-1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Проверка доступа");
    expect(useDocumentsTabMock).not.toHaveBeenCalled();
  });
});
