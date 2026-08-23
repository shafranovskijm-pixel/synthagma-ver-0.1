import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let organizationId = "org-a";

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({ organizationId }),
}));

import { useOrgSidebarPinned, useRecentActions } from "@/hooks/useOrgSidebarPinned";

beforeEach(() => {
  organizationId = "org-a";
  localStorage.clear();
});

describe("organization-scoped sidebar preferences", () => {
  it("does not leak pinned sections between organizations", async () => {
    const { result, rerender } = renderHook(() => useOrgSidebarPinned());

    act(() => result.current.toggle("courses"));
    expect(localStorage.getItem("org-sidebar-pinned:org-a")).toBe('["courses"]');

    organizationId = "org-b";
    rerender();
    await waitFor(() => expect(result.current.pinned).toEqual([]));

    act(() => result.current.toggle("students"));
    expect(localStorage.getItem("org-sidebar-pinned:org-b")).toBe('["students"]');

    organizationId = "org-a";
    rerender();
    await waitFor(() => expect(result.current.pinned).toEqual(["courses"]));
  });

  it("does not leak recent quick actions between organizations", async () => {
    const { result, rerender } = renderHook(() => useRecentActions());

    act(() => result.current.track({ id: "create-course", label: "Создать курс" }));
    expect(localStorage.getItem("org-recent-actions:org-a")).toContain("create-course");

    organizationId = "org-b";
    rerender();
    await waitFor(() => expect(result.current.recent).toEqual([]));
    expect(localStorage.getItem("org-recent-actions:org-b")).toBeNull();
  });
});
