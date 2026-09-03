import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupFolderTab } from "@/components/organization/tabs/GroupFolderTab";
import type { GenerationContext } from "@/lib/group-docs/schema";

const db = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  refresh: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = { table, filters: [] as Array<[string, unknown]> };
      db.queries.push(query);
      const rows = () => (db.rows[table] || []).filter((row) => query.filters.every(
        ([field, value]) => Array.isArray(value) ? value.includes(row[field]) : row[field] === value,
      ));
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => { query.filters.push([field, value]); return builder; },
        is: (field: string, value: unknown) => { query.filters.push([field, value]); return builder; },
        in: (field: string, values: unknown[]) => { query.filters.push([field, values]); return builder; },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (result: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(resolve),
      };
      return builder;
    },
  },
}));
vi.mock("@/contexts/OrgDashboardContext", () => ({ useOrgDashboard: () => ({}) }));
vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({ can: () => true, canSeeOrgTab: () => true, loading: false }),
}));
vi.mock("@/hooks/useGroupFolderCounts", () => ({
  useGroupFolderCounts: () => ({ counts: {}, refresh: db.refresh }),
}));
vi.mock("@/components/organization/group-folder/ContractsFolder", () => ({ ContractsFolder: () => null }));
vi.mock("@/components/organization/GroupSettingsDialog", () => ({ GroupSettingsDialog: () => null }));
vi.mock("@/components/organization/groups/AddStudentsToGroupDialog", () => ({ AddStudentsToGroupDialog: () => null }));
vi.mock("@/components/organization/group-folder/GroupDocumentsFolder", () => ({
  GroupDocumentsFolder: ({ ctx }: { ctx: GenerationContext }) =>
    <output data-testid="group-document-context">{JSON.stringify(ctx)}</output>,
}));

beforeEach(() => {
  db.queries.length = 0;
  db.rows = {
    student_groups: [{ id: "group-1", organization_id: "org-1", name: "Учебная группа", course_id: null }],
    organizations: [{ id: "org-1", name: "Учебный центр" }],
    profiles: [{
      user_id: "student-1", organization_id: "org-1", student_group_id: "group-1", archived_at: null,
      full_name: "Иванов Иван Иванович", email: "student@example.test",
    }],
    student_frdo_data: [
      {
        user_id: "student-1", organization_id: "org-1", passport_series: "1111", passport_number: "222222",
        education_level: "Высшее образование", snils: "own-snils",
      },
      {
        user_id: "student-1", organization_id: "org-2", passport_series: "9999", passport_number: "888888",
        education_level: "foreign-education", snils: "foreign-snils",
      },
    ],
  };
});
afterEach(cleanup);

async function loadGenerationContext() {
  render(
    <MemoryRouter initialEntries={["/organization?tab=group-folder&groupId=group-1&folder=docs"]}>
      <GroupFolderTab organizationId="org-1" groupId="group-1" />
    </MemoryRouter>,
  );
  return JSON.parse((await screen.findByTestId("group-document-context")).textContent || "null") as GenerationContext;
}

describe("GroupFolderTab FRDO tenant isolation", () => {
  it("uses the selected organization's personal data even when an admin can read both FRDO rows", async () => {
    const context = await loadGenerationContext();
    expect(context.students).toHaveLength(1);
    expect(context.students[0]).toMatchObject({
      user_id: "student-1", passport_series: "1111", passport_number: "222222",
      education: "Высшее образование", snils: "own-snils",
    });
    expect(JSON.stringify(context)).not.toMatch(/foreign|9999|888888/);
    expect(db.queries.find((query) => query.table === "student_frdo_data")?.filters).toEqual([
      ["organization_id", "org-1"], ["user_id", ["student-1"]],
    ]);
  });

  it("keeps optional fields empty when only another organization's FRDO row exists", async () => {
    db.rows.student_frdo_data = db.rows.student_frdo_data.filter((row) => row.organization_id === "org-2");
    const context = await loadGenerationContext();
    expect(context.students).toHaveLength(1);
    expect(context.students[0].passport_series).toBeUndefined();
    expect(context.students[0].education).toBeUndefined();
    expect(context.students[0].snils).toBeUndefined();
    expect(JSON.stringify(context)).not.toMatch(/foreign|9999|888888/);
  });
});
