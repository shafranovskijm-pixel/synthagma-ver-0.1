import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GroupFolderTab } from "@/components/organization/tabs/GroupFolderTab";

const db = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return { from: vi.fn(() => builder), builder };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: db.from },
}));

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({}),
}));

vi.mock("@/hooks/useGroupFolderCounts", () => ({
  useGroupFolderCounts: () => ({ counts: {}, refresh: vi.fn() }),
}));

describe("GroupFolderTab organization scope", () => {
  it("fails closed for an unknown or foreign group before loading related data", async () => {
    db.builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    render(
      <MemoryRouter initialEntries={["/organization?tab=group-folder&groupId=foreign-group"]}>
        <GroupFolderTab organizationId="org-1" groupId="foreign-group" />
      </MemoryRouter>,
    );

    await screen.findByText("Группа не найдена.");
    await waitFor(() => expect(db.from).toHaveBeenCalledTimes(1));
    expect(db.from).toHaveBeenCalledWith("student_groups");
    expect(db.builder.eq).toHaveBeenNthCalledWith(1, "id", "foreign-group");
    expect(db.builder.eq).toHaveBeenNthCalledWith(2, "organization_id", "org-1");
  });
});
