import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupFolderTab } from "@/components/organization/tabs/GroupFolderTab";

const db = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  errors: {} as Record<string, unknown>,
  rejectedTables: new Set<string>(),
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]>; from: number; to: number; order?: string }>,
  refresh: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const query = { table, filters: [] as Array<[string, unknown]>, from: 0, to: 999, order: undefined as string | undefined };
    db.queries.push(query);
    const result = () => {
      if (db.rejectedTables.has(table)) throw new Error("Connection dropped");
      const error = db.errors[`${table}:${query.from}`] ?? db.errors[table] ?? null;
      const source = table === "student_group_profiles_effective"
        ? (db.rows.profiles ?? []).flatMap(profile => [...new Set([profile.student_group_id,
          ...(db.rows.student_group_memberships ?? []).filter(member => member.user_id === profile.user_id && member.organization_id === profile.organization_id).map(member => member.group_id),
        ].filter(Boolean))].map(group_id => ({ ...profile, group_id })))
        : (db.rows[table] || []);
      let rows = source.filter(row => query.filters.every(
        ([field, value]) => Array.isArray(value) ? value.includes(row[field]) : row[field] === value,
      ));
      if (query.order) rows = [...rows].sort((a, b) => String(a[query.order!]).localeCompare(String(b[query.order!])));
      return { data: error ? null : rows.slice(query.from, query.to + 1), error };
    };
    const builder = {
      select: () => builder,
      eq: (field: string, value: unknown) => { query.filters.push([field, value]); return builder; },
      is: (field: string, value: unknown) => { query.filters.push([field, value]); return builder; },
      in: (field: string, values: unknown[]) => { query.filters.push([field, values]); return builder; },
      order: (field: string) => { query.order = field; return builder; },
      range: (from: number, to: number) => { query.from = from; query.to = to; return builder; },
      maybeSingle: async () => { const res = result(); return { ...res, data: res.data?.[0] ?? null }; },
      then: (resolve: (value: ReturnType<typeof result>) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve().then(result).then(resolve, reject),
    };
    return builder;
  },
} }));
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
  GroupDocumentsFolder: ({ ctx }: { ctx: unknown }) => <div data-testid="document-context">{JSON.stringify(ctx)}</div>,
}));

function profile(index: number, archived = false) {
  return {
    user_id: `student-${String(index).padStart(4, "0")}`, full_name: `Ученик ${index}`,
    organization_id: "org-1", student_group_id: "group-1", archived_at: archived ? "2026-09-01" : null,
  };
}
function mount(groupId = "group-1") {
  return render(<MemoryRouter initialEntries={[`/organization?tab=group-folder&groupId=${groupId}&folder=docs`]}>
    <GroupFolderTab organizationId="org-1" groupId={groupId} />
  </MemoryRouter>);
}
async function context() {
  return JSON.parse((await screen.findByTestId("document-context")).textContent || "null");
}

beforeEach(() => {
  db.queries.length = 0;
  db.errors = {};
  db.rejectedTables.clear();
  db.rows = {
    student_groups: [{ id: "group-1", organization_id: "org-1", name: "Учебный центр", course_id: null }],
    organizations: [{ id: "org-1", name: "Организация" }],
    profiles: [profile(1)],
  };
});
afterEach(cleanup);

describe("GroupFolderTab roster loading", () => {
  it("shows an additional-group member once and preserves their original primary group", async () => {
    db.rows.student_groups.push({ id: "group-2", organization_id: "org-1", name: "Второе обучение", course_id: null });
    db.rows.student_group_memberships = [{ user_id: "student-0001", organization_id: "org-1", group_id: "group-2" }];
    const mounted = mount("group-2");
    expect((await context()).students.map((student: any) => student.user_id)).toEqual(["student-0001"]);
    expect(db.rows.profiles[0].student_group_id).toBe("group-1");
    mounted.unmount();
    mount("group-1");
    expect((await context()).students.map((student: any) => student.user_id)).toEqual(["student-0001"]);
  });

  it("renders all 79 active learners independently of the organization list page", async () => {
    db.rows.profiles = Array.from({ length: 79 }, (_, index) => profile(index));
    mount();
    expect((await context()).students).toHaveLength(79);
    expect(screen.getAllByText("79 активных учеников").length).toBeGreaterThan(0);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("explains an all-archived group instead of implying its 79 learners disappeared", async () => {
    db.rows.profiles = Array.from({ length: 79 }, (_, index) => profile(index, true));
    mount();
    expect((await context()).students).toEqual([]);
    expect(screen.getByRole("status")).toHaveTextContent("В архиве этой группы: 79");
    expect(screen.getAllByText("0 активных учеников").length).toBeGreaterThan(0);
  });

  it("keeps archived and foreign learners out of document generation", async () => {
    db.rows.profiles = [profile(1), profile(2, true), { ...profile(3), organization_id: "org-2" }, { ...profile(4), student_group_id: "group-2" }];
    mount();
    expect((await context()).students.map((row: { user_id: string }) => row.user_id)).toEqual(["student-0001"]);
    expect(screen.getByRole("status")).toHaveTextContent("В архиве этой группы: 1");
  });

  it("loads an active learner after a full page of archived learners", async () => {
    db.rows.profiles = [...Array.from({ length: 1000 }, (_, index) => profile(index, true)), profile(1000)];
    mount();
    expect((await context()).students.map((row: { user_id: string }) => row.user_id)).toEqual(["student-1000"]);
    expect(screen.getByRole("status")).toHaveTextContent("В архиве этой группы: 1000");
    expect(db.queries.filter(query => query.table === "student_group_profiles_effective").map(query => [query.from, query.order])).toEqual([[0, "user_id"], [1000, "user_id"]]);
  });

  it("shows a retryable error for a failed profiles query and recovers", async () => {
    db.errors.student_group_profiles_effective = { code: "42501", message: "Permission denied" };
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить данные группы");
    expect(screen.queryByTestId("document-context")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 активных учеников/)).not.toBeInTheDocument();
    delete db.errors.student_group_profiles_effective;
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect((await context()).students).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not expose partial results when a later profile page fails", async () => {
    db.rows.profiles = Array.from({ length: 1001 }, (_, index) => profile(index));
    db.errors["student_group_profiles_effective:1000"] = { message: "Interrupted" };
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByTestId("document-context")).not.toBeInTheDocument();
  });

  it("handles a rejected request without showing an empty group", async () => {
    db.rejectedTables.add("student_group_profiles_effective");
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByTestId("document-context")).not.toBeInTheDocument();
  });

  it("does not claim zero students when enrichment fails after profiles loaded", async () => {
    db.rows.profiles = Array.from({ length: 79 }, (_, index) => profile(index));
    db.rejectedTables.add("student_frdo_data");
    mount();
    await screen.findByRole("alert");
    expect(db.queries.some(query => query.table === "student_frdo_data")).toBe(true);
    expect(screen.queryByText(/0 активных учеников/)).not.toBeInTheDocument();
  });

  it("distinguishes a failed group query from a truly missing group", async () => {
    db.errors.student_groups = { message: "Unavailable" };
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByText("Группа не найдена.")).not.toBeInTheDocument();
  });

  it("fails closed for a foreign group before querying its profiles", async () => {
    db.rows.student_groups = [{ id: "group-2", organization_id: "org-2", name: "Чужая группа" }];
    mount("group-2");
    await screen.findByText("Группа не найдена.");
    expect(db.queries.some(query => query.table === "student_group_profiles_effective")).toBe(false);
  });

  it("keeps a genuinely empty group distinct from a loading failure", async () => {
    db.rows.profiles = [];
    mount();
    expect((await context()).students).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
