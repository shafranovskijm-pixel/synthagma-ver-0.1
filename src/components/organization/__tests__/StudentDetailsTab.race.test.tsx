import { act, render, screen, waitFor } from "@testing-library/react";
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
    activeTab: "profile",
    setActiveTab: vi.fn(),
    isLoading: false,
    previewDoc: null,
    setPreviewDoc: vi.fn(),
    viewConsentDialog: null,
    setViewConsentDialog: vi.fn(),
    isFRDODialogOpen: false,
    setIsFRDODialogOpen: vi.fn(),
    selectedEnrollmentForFRDO: null,
  }),
}));

vi.mock("@/components/organization/student-detail/ProfileTab", () => ({ ProfileTab: () => null }));
vi.mock("@/components/organization/student-detail/IdentificationTab", () => ({ IdentificationTab: () => null }));
vi.mock("@/components/organization/student-detail/CoursesTab", () => ({ CoursesTab: () => null }));
vi.mock("@/components/organization/student-detail/DocumentsTab", () => ({ DocumentsTab: () => null }));
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

      if (table === "courses") {
        const query = {
          select: () => query,
          eq: () => Promise.resolve({ data: [], error: null }),
        };
        return query;
      }

      if (table === "enrollments") {
        const query = {
          select: () => query,
          eq: () => query,
          in: () => Promise.resolve({ data: [], error: null }),
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: (_name: string, args: { p_user_id: string }) => {
      testState.decryptCalls.push(args.p_user_id);
      return Promise.resolve({ data: `password-${args.p_user_id}`, error: null });
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
});
