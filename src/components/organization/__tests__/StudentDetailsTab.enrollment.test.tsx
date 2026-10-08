import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEnrollmentActions } from "@/hooks/useEnrollmentActions";

type Row = { id: string; user_id: string; course_id: string };
type Result = { data: any; error: any };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const state = vi.hoisted(() => ({
  organizationId: "org-1",
  studentId: "student-1",
  canWrite: true,
  courses: [] as any[],
  publishedCourses: new Set<string>(),
  rows: [] as Row[],
  profileLookups: [] as Array<Record<string, unknown>>,
  courseLookups: [] as Array<Record<string, unknown>>,
  courseResult: null as Promise<Result> | null,
  insertResult: null as Promise<Result> | null,
  insertError: null as any,
  suppressReadback: false,
  insert: vi.fn(),
  fetchProfiles: vi.fn(),
  fetchEnrollments: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: state.organizationId,
    tabNavigation: { selectedStudentId: state.studentId },
    courses: state.courses,
    categories: [],
    getCategoryById: () => undefined,
    refreshStudentRows: vi.fn(),
    enrollmentActions: useEnrollmentActions(state.organizationId, "Учебный центр", state.refresh, vi.fn()),
  }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({ can: () => state.canWrite, loading: false }),
}));
vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ plan: "start" }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("@/hooks/useStudentDetailCard", () => ({
  useStudentDetailCardLogic: () => ({
    activeTab: "courses", setActiveTab: vi.fn(), isLoading: false,
    previewDoc: null, viewConsentDialog: null, isFRDODialogOpen: false,
    formatDuration: () => "0 мин", formatDate: () => "09.10.2026",
  }),
}));
vi.mock("@/components/organization/student-detail/ProfileTab", () => ({ ProfileTab: () => null }));
vi.mock("@/components/organization/student-detail/IdentificationTab", () => ({ IdentificationTab: () => null }));
vi.mock("@/components/organization/student-detail/DocumentsTab", () => ({ DocumentsTab: () => null }));
vi.mock("@/components/organization/student-detail/LearningResultsTab", () => ({ LearningResultsTab: () => null }));
vi.mock("@/components/organization/student-detail/ActivityTab", () => ({ ActivityTab: () => null }));
vi.mock("@/components/organization/student-detail/ChatTab", () => ({ ChatTab: () => null }));
vi.mock("@/components/organization/student-detail/SendDocumentToStudentDialog", () => ({ SendDocumentToStudentDialog: () => null }));
vi.mock("@/components/organization/FRDOExportDialog", () => ({ FRDOExportDialog: () => null }));
vi.mock("@/components/organization/CancelCourseAssignmentButton", () => ({ CancelCourseAssignmentButton: () => null }));
vi.mock("@/components/organization/groups/AddStudentsToGroupsDialog", () => ({ AddStudentsToGroupsDialog: () => null }));
vi.mock("@/api/studentGroupMemberships", () => ({ fetchEffectiveGroupMemberships: async () => [] }));
vi.mock("@/api/students", () => ({
  deleteStudent: vi.fn(),
  fetchStudentsByUserIds: (...args: unknown[]) => state.fetchProfiles(...args),
  fetchOrganizationStudentEnrollments: (...args: unknown[]) => state.fetchEnrollments(...args),
}));
vi.mock("@/utils/generateEnrollmentOrder", () => ({ generateEnrollmentOrder: vi.fn().mockResolvedValue(null) }));
vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error, info: state.info, warning: state.warning },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let columns = "";
      const filters: Record<string, any> = {};
      const result = () => {
        if (table === "profiles") {
          if (columns === "student_group_id") return { data: { student_group_id: null }, error: null };
          state.profileLookups.push({ ...filters });
          return {
            data: filters.organization_id === (filters.user_id === "student-3" ? "org-2" : "org-1")
              ? { user_id: filters.user_id, full_name: `Ученик ${filters.user_id}`, email: `${filters.user_id}@example.test`, login: filters.user_id, archived_at: null }
              : null,
            error: null,
          };
        }
        if (table === "courses") {
          state.courseLookups.push({ ...filters });
          return state.courseResult ?? {
            data: filters.organization_id === "org-1" && state.publishedCourses.has(filters.id) ? { id: filters.id } : null,
            error: null,
          };
        }
        if (table === "enrollments") {
          const rows = state.rows.filter(row => row.course_id === filters.course_id && filters.user_id.includes(row.user_id));
          return { data: columns === "user_id" ? rows.map(row => ({ user_id: row.user_id })) : state.suppressReadback ? [] : rows, error: null };
        }
        if (table === "organizations") return { data: { name: "Учебный центр" }, error: null };
        if (table === "student_groups") return { data: [], error: null };
        throw new Error(`Unexpected table: ${table}`);
      };
      const query: any = {
        select: (value: string) => { columns = value; return query; },
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        in: (key: string, values: unknown[]) => { filters[key] = values; return query; },
        order: () => query,
        maybeSingle: () => Promise.resolve(result()),
        single: () => Promise.resolve(result()),
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
        insert: (rows: Array<{ user_id: string; course_id: string }>) => {
          state.insert(rows);
          const inserted = rows.map((row, index) => ({ id: `enrollment-new-${index}`, ...row }));
          if (!state.insertError && !state.insertResult) state.rows.push(...inserted);
          return { select: () => state.insertResult ?? Promise.resolve({ data: state.insertError ? null : inserted, error: state.insertError }) };
        },
      };
      return query;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

import { StudentDetailsTab } from "@/components/organization/tabs/StudentDetailsTab";

const published = { id: "course-new", title: "Дополнительный курс", is_published: true, created_at: "2026-10-01", description: null, lessonsCount: 2, studentsCount: 0 };
const existing = { ...published, id: "course-existing", title: "Прежний курс" };
const draft = { ...published, id: "course-draft", title: "Черновик курса", is_published: false };
const foreign = { ...published, id: "course-foreign", title: "Курс другой организации" };
const ui = () => <MemoryRouter><StudentDetailsTab /></MemoryRouter>;

async function openCourseDialog(title = published.title) {
  fireEvent.click(await screen.findByRole("button", { name: "Добавить курс" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByText(title));
  return screen.getByRole("button", { name: "Зачислить на курс" });
}

describe("course assignment from a student's Courses tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.organizationId = "org-1";
    state.studentId = "student-1";
    state.canWrite = true;
    state.courses = [published, existing, draft];
    state.publishedCourses = new Set([published.id, existing.id]);
    state.rows = [];
    state.profileLookups = [];
    state.courseLookups = [];
    state.courseResult = null;
    state.insertResult = null;
    state.insertError = null;
    state.suppressReadback = false;
    state.fetchProfiles.mockImplementation(async (org: string, ids: string[]) => {
      if (org !== "org-1" || ids.some(id => !["student-1", "student-2"].includes(id))) throw new Error("profile outside organization");
      return { students: ids.map(id => ({ user_id: id, name: `Ученик ${id}` })) };
    });
    state.fetchEnrollments.mockImplementation(async ({ userId }: { userId: string }) => state.rows.filter(row => row.user_id === userId).map(row => ({
      ...row, course_title: state.courses.find(course => course.id === row.course_id)?.title,
      progress: 0, status: "active", started_at: "2026-10-09T00:00:00Z", time_spent: 0, access_days: null,
    })));
  });

  it("assigns an additional course directly from an empty profile, confirms persistence, closes and refreshes", async () => {
    render(ui());
    const submit = await openCourseDialog();
    expect(screen.queryByText(draft.title)).not.toBeInTheDocument();
    fireEvent.click(submit);
    await waitFor(() => expect(state.insert).toHaveBeenCalledExactlyOnceWith([
      { user_id: "student-1", course_id: published.id, status: "active", progress: 0 },
    ]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("heading", { name: "Курсы (1)" })).toBeInTheDocument();
    expect(state.courseLookups).toEqual([{ id: published.id, organization_id: "org-1", is_published: true }]);
    expect(state.fetchProfiles).toHaveBeenCalledWith("org-1", ["student-1"], { includeEnrollments: false });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(state.success).toHaveBeenCalledWith("Зачислено 1 учеников");
  });

  it("offers only additional published courses and preserves the previous assignment", async () => {
    state.rows = [{ id: "old-enrollment", user_id: "student-1", course_id: existing.id }];
    render(ui());
    const submit = await openCourseDialog();
    expect(screen.getAllByText(existing.title)).toHaveLength(1); // The old course remains in the profile behind the dialog.
    expect(screen.queryByText(draft.title)).not.toBeInTheDocument();
    fireEvent.click(submit);
    expect(await screen.findByRole("heading", { name: "Курсы (2)" })).toBeInTheDocument();
    expect(state.rows.some(row => row.id === "old-enrollment")).toBe(true);
  });

  it("reconciles an assignment added concurrently without creating a duplicate or announcing success", async () => {
    render(ui());
    const submit = await openCourseDialog();
    state.rows.push({ id: "concurrent-enrollment", user_id: "student-1", course_id: published.id });
    fireEvent.click(submit);
    await waitFor(() => expect(state.info).toHaveBeenCalledWith("Все выбранные ученики уже зачислены на этот курс"));
    await waitFor(() => expect(screen.getByText("Курсы (1)")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Зачислить на курс" })).not.toBeInTheDocument();
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("rejects a foreign course even if a stale directory contains it", async () => {
    state.courses.push(foreign);
    render(ui());
    fireEvent.click(await openCourseDialog(foreign.title));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Курс недоступен для зачисления в этой организации. Обновите список курсов."));
    expect(state.courseLookups).toEqual([{ id: foreign.id, organization_id: "org-1", is_published: true }]);
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.fetchProfiles).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("rejects a course unpublished after the dialog was opened", async () => {
    render(ui());
    const submit = await openCourseDialog();
    state.publishedCourses.delete(published.id);
    fireEvent.click(submit);
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
  });

  it("fails closed when course verification is unavailable", async () => {
    state.courseResult = Promise.resolve({ data: null, error: new Error("database unavailable") });
    render(ui());
    fireEvent.click(await openCourseDialog());
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Не удалось проверить курс. Зачисление не выполнено, повторите попытку."));
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps the course selected after a denied write and permits a successful retry", async () => {
    state.insertError = { message: "RLS denied", code: "42501" };
    render(ui());
    fireEvent.click(await openCourseDialog());
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Ошибка зачисления"));
    expect(state.success).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Зачислить на курс" })).toBeEnabled());
    state.insertError = null;
    fireEvent.click(screen.getByRole("button", { name: "Зачислить на курс" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Курсы (1)" })).toBeInTheDocument();
  });

  it("does not report success when the fresh enrollment read-back is empty", async () => {
    state.suppressReadback = true;
    render(ui());
    fireEvent.click(await openCourseDialog());
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("База не подтвердила зачисление. Список обновлён — повторите операцию."));
    expect(state.success).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Курсы (1)" })).toBeInTheDocument();
  });

  it("blocks a second submit and closing while verification is pending", async () => {
    const check = deferred<Result>();
    state.courseResult = check.promise;
    render(ui());
    const submit = await openCourseDialog();
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(state.courseLookups).toHaveLength(1);
    await act(async () => check.resolve({ data: { id: published.id }, error: null }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));
  });

  it.each(["student", "organization"])("cancels preflight after the %s context changes", async (context) => {
    const check = deferred<Result>();
    state.courseResult = check.promise;
    const view = render(ui());
    fireEvent.click(await openCourseDialog());
    if (context === "student") state.studentId = "student-2";
    else { state.organizationId = "org-2"; state.studentId = "student-3"; }
    view.rerender(ui());
    expect(await screen.findByText(`Ученик ${state.studentId}`)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => check.resolve({ data: { id: published.id }, error: null }));
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.fetchProfiles).not.toHaveBeenCalled();
  });

  it("never reloads the old profile when its in-flight enrollment finishes on a new profile", async () => {
    const write = deferred<Result>();
    state.insertResult = write.promise;
    const view = render(ui());
    fireEvent.click(await openCourseDialog());
    await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));
    state.studentId = "student-2";
    view.rerender(ui());
    expect(await screen.findByText("Ученик student-2")).toBeInTheDocument();
    const oldLookups = state.profileLookups.filter(row => row.user_id === "student-1").length;
    const row = { id: "enrollment-finished", user_id: "student-1", course_id: published.id };
    state.rows.push(row);
    await act(async () => write.resolve({ data: [row], error: null }));
    expect(screen.getByText("Ученик student-2")).toBeInTheDocument();
    expect(state.profileLookups.filter(item => item.user_id === "student-1")).toHaveLength(oldLookups);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not begin enrollment after leaving the profile while preflight is pending", async () => {
    const check = deferred<Result>();
    state.courseResult = check.promise;
    const view = render(ui());
    fireEvent.click(await openCourseDialog());
    view.unmount();
    await act(async () => check.resolve({ data: { id: published.id }, error: null }));
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.fetchProfiles).not.toHaveBeenCalled();
  });

  it("does not revive a closed enrollment intent after returning A → B → A", async () => {
    const check = deferred<Result>();
    state.courseResult = check.promise;
    const view = render(ui());
    fireEvent.click(await openCourseDialog());
    state.studentId = "student-2";
    view.rerender(ui());
    expect(await screen.findByText("Ученик student-2")).toBeInTheDocument();
    state.studentId = "student-1";
    view.rerender(ui());
    expect(await screen.findByText("Ученик student-1")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => check.resolve({ data: { id: published.id }, error: null }));
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.fetchProfiles).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Курсы (0)" })).toBeInTheDocument();
  });

  it("does not expose course assignment to staff without students.write", async () => {
    state.canWrite = false;
    render(ui());
    expect(await screen.findByRole("heading", { name: "Курсы (0)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить курс" })).not.toBeInTheDocument();
  });
});
