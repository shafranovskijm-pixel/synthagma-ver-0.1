import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const testState = vi.hoisted(() => ({
  selectedStudentId: "student-a" as string | null,
  profileResponses: new Map<string, Promise<{ data: any; error: any }>>(),
  profileLookups: [] as Array<Record<string, string>>,
  decryptCalls: [] as string[],
  activeTab: "profile",
  studentDataLoadError: null as string | null,
  studentDataLoading: false,
  retryStudentData: vi.fn(),
  studentPageError: null as Error | null,
  studentPageCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: "org-1",
    tabNavigation: {
      selectedStudentId: testState.selectedStudentId,
      setActiveTab: vi.fn(),
    },
    refreshStudentRows: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/hooks/useSubscriptionLimits", () => ({
  useSubscriptionLimits: () => ({ plan: "start" }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
}));

vi.mock("@/lib/invalidateOrganizationQueries", () => ({
  invalidateOrganizationDocumentData: vi.fn(),
}));

vi.mock("@/hooks/useStudentDetailCard", () => ({
  useStudentDetailCardLogic: () => ({
    activeTab: testState.activeTab,
    setActiveTab: vi.fn(),
    isLoading: testState.studentDataLoading,
    dataLoadError: testState.studentDataLoadError,
    retryLoadStudentData: testState.retryStudentData,
    previewDoc: null,
    setPreviewDoc: vi.fn(),
    viewConsentDialog: null,
    setViewConsentDialog: vi.fn(),
    isFRDODialogOpen: false,
    setIsFRDODialogOpen: vi.fn(),
    selectedEnrollmentForFRDO: null,
  }),
}));

vi.mock("@/components/organization/student-detail/ProfileTab", () => ({
  ProfileTab: ({ enrollmentsCount }: { enrollmentsCount: number | null }) => (
    <div>
      <div>Личное дело доступно</div>
      <div>Курсы: {enrollmentsCount === null ? "Не подтверждено" : enrollmentsCount}</div>
    </div>
  ),
}));
vi.mock("@/components/organization/student-detail/IdentificationTab", () => ({ IdentificationTab: () => null }));
vi.mock("@/components/organization/student-detail/CoursesTab", () => ({
  CoursesTab: ({ enrollments }: { enrollments: unknown[] }) => <div>Курсы ({enrollments.length})</div>,
}));
vi.mock("@/components/organization/student-detail/DocumentsTab", () => ({
  DocumentsTab: ({ laborSafetyXml }: { laborSafetyXml?: { organizationId: string; student: { userId: string } } }) => (
    <div data-testid="documents-local-boundary">XML: {laborSafetyXml?.organizationId}/{laborSafetyXml?.student.userId}</div>
  ),
}));
vi.mock("@/components/organization/student-detail/ActivityTab", () => ({ ActivityTab: () => null }));
vi.mock("@/components/organization/student-detail/ChatTab", () => ({ ChatTab: () => null }));
vi.mock("@/components/organization/student-detail/SendDocumentToStudentDialog", () => ({
  SendDocumentToStudentDialog: () => null,
}));
vi.mock("@/components/organization/FRDOExportDialog", () => ({ FRDOExportDialog: () => null }));
vi.mock("@/components/ui/SigmaSpinner", () => ({
  SigmaSpinner: () => <div data-testid="student-spinner" />,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "profiles") {
        const filters: Record<string, string> = {};
        const query = {
          select: () => query,
          eq: (column: string, value: string) => {
            filters[column] = value;
            return query;
          },
          maybeSingle: () => {
            testState.profileLookups.push({ ...filters });
            return testState.profileResponses.get(filters.user_id)
              ?? Promise.resolve({ data: null, error: null });
          },
        };
        return query;
      }

      if (table === "enrollments") {
        const query = {
          select: () => query,
          in: () => Promise.resolve({ data: [], error: null }),
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: (name: string, args: Record<string, any>) => {
      if (name === "get_decrypted_student_password") {
        testState.decryptCalls.push(args.p_user_id);
        return Promise.resolve({ data: `password-${args.p_user_id}`, error: null });
      }
      if (name === "get_organization_students_page") {
        testState.studentPageCalls.push(args);
        if (testState.studentPageError) {
          return Promise.resolve({ data: null, error: testState.studentPageError });
        }
        const id = String(args.p_search);
        return Promise.resolve({
          data: [{
            id: `profile-${id}`,
            user_id: id,
            full_name: `Student ${id}`,
            email: `${id}@example.test`,
            login: id,
            archived_at: null,
            progress: 0,
            status: null,
            last_activity: null,
            enrollments: [],
            total_count: 1,
            active_count: 1,
            archived_count: 0,
          }],
          error: null,
        });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  },
}));

import { StudentDetailsTab } from "@/components/organization/tabs/StudentDetailsTab";

const profile = (id: string, name: string) => ({
  user_id: id,
  full_name: name,
  email: `${id}@example.test`,
  login: id,
  generated_password: null,
  last_visit_at: null,
  organization_id: "org-1",
  company_id: null,
  companies: null,
  archived_at: null,
});

const renderDetails = () => render(
  <MemoryRouter initialEntries={["/organization?tab=student-details"]}>
    <StudentDetailsTab />
  </MemoryRouter>,
);

describe("StudentDetailsTab URL request ordering and tenant scope", () => {
  beforeEach(() => {
    testState.selectedStudentId = "student-a";
    testState.profileResponses.clear();
    testState.profileLookups.length = 0;
    testState.decryptCalls.length = 0;
    testState.activeTab = "profile";
    testState.studentDataLoadError = null;
    testState.studentDataLoading = false;
    testState.retryStudentData.mockClear();
    testState.studentPageError = null;
    testState.studentPageCalls.length = 0;
  });

  it("keeps student B when the slower student A lookup resolves last", async () => {
    const studentA = deferred<{ data: any; error: null }>();
    const studentB = deferred<{ data: any; error: null }>();
    testState.profileResponses.set("student-a", studentA.promise);
    testState.profileResponses.set("student-b", studentB.promise);

    const view = renderDetails();
    await waitFor(() => expect(testState.profileLookups).toContainEqual({
      user_id: "student-a",
      organization_id: "org-1",
    }));

    testState.selectedStudentId = "student-b";
    view.rerender(
      <MemoryRouter initialEntries={["/organization?tab=student-details"]}>
        <StudentDetailsTab />
      </MemoryRouter>,
    );
    await waitFor(() => expect(testState.profileLookups).toContainEqual({
      user_id: "student-b",
      organization_id: "org-1",
    }));

    await act(async () => {
      studentB.resolve({ data: profile("student-b", "Student B"), error: null });
      await studentB.promise;
    });
    expect(await screen.findByText("Student B")).toBeInTheDocument();

    await act(async () => {
      studentA.resolve({ data: profile("student-a", "Student A"), error: null });
      await studentA.promise;
    });

    expect(screen.getByText("Student B")).toBeInTheDocument();
    expect(screen.queryByText("Student A")).not.toBeInTheDocument();
    expect(testState.decryptCalls).toEqual(["student-b"]);
  });

  it("fails closed for a foreign or unknown student before decrypting credentials", async () => {
    testState.selectedStudentId = "foreign-student";
    testState.profileResponses.set(
      "foreign-student",
      Promise.resolve({ data: null, error: null }),
    );

    renderDetails();

    expect(await screen.findByText("Ученик не найден")).toBeInTheDocument();
    expect(testState.profileLookups).toContainEqual({
      user_id: "foreign-student",
      organization_id: "org-1",
    });
    expect(testState.decryptCalls).toEqual([]);
  });

  it("keeps the profile available and does not report zero when the enrollment RPC fails", async () => {
    testState.activeTab = "profile";
    testState.studentPageError = new Error("database unavailable");
    testState.profileResponses.set(
      "student-a",
      Promise.resolve({ data: profile("student-a", "Student A"), error: null }),
    );

    renderDetails();

    expect(await screen.findByText("Личное дело доступно")).toBeInTheDocument();
    expect(screen.getByText("Курсы: Не подтверждено")).toBeInTheDocument();
    expect(screen.queryByText("Курсы: 0")).not.toBeInTheDocument();
    expect(screen.queryByText("Не удалось загрузить профиль ученика")).not.toBeInTheDocument();
  });

  it("shows an inline retry state instead of zero courses when the canonical enrollment RPC fails", async () => {
    testState.activeTab = "courses";
    testState.studentPageError = new Error("database unavailable");
    testState.profileResponses.set(
      "student-a",
      Promise.resolve({ data: profile("student-a", "Student A"), error: null }),
    );

    renderDetails();

    expect(await screen.findByText("Не удалось подтвердить список курсов")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
    expect(screen.queryByText("Курсы (0)")).not.toBeInTheDocument();

    testState.studentPageError = null;
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("Курсы (0)")).toBeInTheDocument();
    expect(screen.queryByText("Не удалось подтвердить список курсов")).not.toBeInTheDocument();
    expect(testState.studentPageCalls.at(-1)).toEqual(expect.objectContaining({
      p_organization_id: "org-1",
      p_search: "student-a",
      p_limit: 100,
      p_offset: 0,
    }));
  });

  it("shows a fail-closed retry state on personal-data tabs", async () => {
    testState.activeTab = "profile";
    testState.studentDataLoadError = "Не удалось подтвердить личное дело";
    testState.profileResponses.set(
      "student-a",
      Promise.resolve({ data: profile("student-a", "Student A"), error: null }),
    );

    renderDetails();

    expect(await screen.findByText("Не удалось загрузить личное дело")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(testState.retryStudentData).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Личное дело доступно")).not.toBeInTheDocument();
  });

  it("keeps independent course and header actions available when personal-data loading fails", async () => {
    testState.activeTab = "courses";
    testState.studentDataLoadError = "Не удалось подтвердить личное дело";
    testState.profileResponses.set(
      "student-a",
      Promise.resolve({ data: profile("student-a", "Student A"), error: null }),
    );

    renderDetails();

    expect(await screen.findByText("Курсы (0)")).toBeInTheDocument();
    expect(screen.queryByText("Не удалось загрузить личное дело")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отправить на подпись" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Войти как ученик" })).toBeEnabled();
  });

  it.each(["loading", "error"])("delegates the documents %s boundary locally so XML stays mounted", async (mode) => {
    testState.activeTab = "documents";
    testState.studentDataLoading = mode === "loading";
    testState.studentDataLoadError = mode === "error" ? "Ошибка согласий" : null;
    testState.profileResponses.set("student-a", Promise.resolve({ data: profile("student-a", "Student A"), error: null }));

    renderDetails();

    expect(await screen.findByTestId("documents-local-boundary")).toHaveTextContent("XML: org-1/student-a");
    expect(screen.queryByText("Не удалось загрузить личное дело")).not.toBeInTheDocument();
  });
});
