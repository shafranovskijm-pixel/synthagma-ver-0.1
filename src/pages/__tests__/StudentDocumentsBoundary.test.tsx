import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  activeTab: "documents",
  loading: false,
  error: "Не удалось подтвердить согласия" as string | null,
  retry: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useStudentDetailCard", () => ({
  useStudentDetailCardLogic: () => ({
    activeTab: state.activeTab,
    isLoading: state.loading,
    dataLoadError: state.error,
    retryLoadStudentData: state.retry,
    setActiveTab: vi.fn(),
    frdoData: null,
  }),
}));
vi.mock("@/contexts/OrgDashboardContext", () => ({ useOrgDashboard: () => ({}) }));
vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ plan: "start" }) }));
vi.mock("@/components/organization/student-detail/ProfileTab", () => ({ ProfileTab: () => <div>Личные данные доступны</div> }));
vi.mock("@/components/organization/student-detail/IdentificationTab", () => ({ IdentificationTab: () => null }));
vi.mock("@/components/organization/student-detail/CoursesTab", () => ({ CoursesTab: () => null }));
vi.mock("@/components/organization/student-detail/ActivityTab", () => ({ ActivityTab: () => null }));
vi.mock("@/components/organization/student-detail/ChatTab", () => ({ ChatTab: () => null }));
vi.mock("@/components/organization/student-detail/StudentLaborSafetyXmlCard", () => ({ StudentLaborSafetyXmlCard: () => null }));
vi.mock("@/components/organization/FRDOExportDialog", () => ({ FRDOExportDialog: () => null }));
vi.mock("@/components/organization/OrgSidebar", () => ({ OrgSidebar: () => null }));
vi.mock("@/components/organization/OrgDashboardFooter", () => ({ OrgDashboardFooter: () => null }));
vi.mock("@/components/organization/OrgNotifications", () => ({ OrgNotifications: () => null }));
vi.mock("@/components/shared/HelpCenterDialog", () => ({ HelpCenterDialog: () => null }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const response = () => Promise.resolve({
        data: table === "profiles" ? {
          user_id: "student-1", full_name: "Попова Елизавета", email: "student@example.test", organization_id: "org-1",
        } : table === "organizations" ? { name: "Организация" } : table === "user_roles" ? { role: "student" } : [],
        error: null,
      });
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: response,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => response().then(resolve, reject),
      };
      return query;
    },
  },
}));

import AdminUserDetails from "@/pages/AdminUserDetails";
import OrganizationStudentDetails from "@/pages/OrganizationStudentDetails";

const renderAdmin = () => render(
  <MemoryRouter initialEntries={["/admin/user/student-1"]}>
    <Routes><Route path="/admin/user/:userId" element={<AdminUserDetails />} /></Routes>
  </MemoryRouter>,
);

describe("student document boundary consumers", () => {
  beforeEach(() => {
    state.activeTab = "documents";
    state.loading = false;
    state.error = "Не удалось подтвердить согласия";
    state.retry.mockClear();
  });

  it("lets DocumentsTab own the admin personal-document error and retry", async () => {
    renderAdmin();
    expect(await screen.findByText("Не удалось загрузить личные документы")).toBeInTheDocument();
    expect(screen.queryByText("Не удалось загрузить личное дело")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(state.retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Нет загруженных документов")).not.toBeInTheDocument();
  });

  it("lets DocumentsTab own admin loading without mounting the personal form", async () => {
    state.loading = true;
    state.error = null;
    renderAdmin();
    expect(await screen.findByText("Загрузка личных документов…")).toBeInTheDocument();
    expect(screen.queryByText("Загрузить документы")).not.toBeInTheDocument();
  });

  it("keeps the external fail-closed boundary on the admin profile tab", async () => {
    state.activeTab = "profile";
    renderAdmin();
    expect(await screen.findByText("Не удалось загрузить личное дело")).toBeInTheDocument();
    expect(screen.queryByText("Личные данные доступны")).not.toBeInTheDocument();
  });

  it("preserves the legacy organization route redirect to the shared student workspace", async () => {
    const Destination = () => {
      const location = useLocation();
      return <div>{location.pathname}{location.search}</div>;
    };
    render(
      <MemoryRouter initialEntries={["/organization/student/student-1"]}>
        <Routes>
          <Route path="/organization/student/:studentId" element={<OrganizationStudentDetails />} />
          <Route path="/organization" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("/organization?tab=student-details&studentId=student-1")).toBeInTheDocument();
  });
});
