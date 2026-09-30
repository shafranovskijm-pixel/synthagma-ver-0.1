import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

const backend = vi.hoisted(() => ({ profile: null as any, filters: [] as Array<[string, unknown]> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const result = () => ({ data: table === "profiles" ? backend.profile : [], error: null, count: 0 });
    const query: any = {
      select: () => query, eq: (key: string, value: unknown) => { backend.filters.push([key, value]); return query; },
      not: () => query, order: () => query,
      maybeSingle: () => Promise.resolve(result()),
      then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  },
  channel: () => { const channel: any = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, signOut: vi.fn() }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/hooks/useCompanyDashboard", () => ({ useCompanyDashboard: () => ({
  company: { id: "company-1", organization_id: "org-1", name: "QA Company" }, employees: [], stats: {}, loading: false,
}) }));
vi.mock("@/contexts/OrgDashboardContext", () => ({ useOrgDashboard: () => ({
  organizationId: "org-1", user: { id: "operator-1" },
  orgChats: { isLoading: false, refresh: vi.fn(), conversations: [
    { studentUserId: "student-1", studentName: "QA Learner", lastMessage: "Message", lastMessageAt: "2026-09-29T10:00:00Z", unreadCount: 0 },
  ] },
}) }));
vi.mock("@/hooks/useAdminMarketplaceCrud", () => ({
  fetchMarketplaceCourses: async () => [], fetchMarketplaceOrders: async () => [], fetchDbCategoriesData: async () => [],
}));
vi.mock("@/components/onboarding/OnboardingDialog", () => ({ OnboardingDialog: () => null }));
vi.mock("@/components/shared/AnnouncementsBell", () => ({ AnnouncementsBell: () => null }));
vi.mock("@/components/company/CompanyStatsCards", () => ({ CompanyStatsCards: () => <h2>Company home</h2> }));
vi.mock("@/components/company/CompanyEmployeesTab", () => ({ CompanyEmployeesTab: () => <h2>Company employees</h2> }));
vi.mock("@/components/company/TrainingPlansTab", () => ({ TrainingPlansTab: () => <h2>Company planning</h2> }));
vi.mock("@/components/company/CompanyDocumentsTab", () => ({ CompanyDocumentsTab: () => <h2>Company documents</h2> }));
vi.mock("@/components/company/CompanyRemindersTab", () => ({ CompanyRemindersTab: () => null }));
vi.mock("@/components/company/CompanyRequestsTab", () => ({ CompanyRequestsTab: () => null }));
vi.mock("@/components/company/CompanyStaffManager", () => ({ CompanyStaffManager: () => null }));
vi.mock("@/components/organization/student-detail/ChatTab", () => ({ ChatTab: ({ studentUserId }: any) => <h2>Conversation {studentUserId}</h2> }));
vi.mock("@/components/organization/AdminChatDialog", () => ({ AdminChatDialog: () => <h2>Support conversation</h2> }));
vi.mock("@/components/chat/AiChatPanel", () => ({ AiChatPanel: () => <h2>AI conversation</h2> }));
vi.mock("@/components/chat/ColleagueChatPanel", () => ({ ColleagueChatPanel: () => null }));
vi.mock("@/components/chat/ChatSidebar", () => ({ ChatSidebar: () => null }));
vi.mock("@/components/chat/ChatSettingsPanel", () => ({ ChatSettingsPanel: () => null }));
vi.mock("@/components/chat/ChatRequestsPanel", () => ({ ChatRequestsPanel: () => null }));
vi.mock("@/components/chat/ChatContactsPanel", () => ({ ChatContactsPanel: ({ onStartChat }: any) => <button onClick={() => onStartChat("student-1", "QA Learner")}>Open contact chat</button> }));
vi.mock("@/components/chat/OrgGeneralChat", () => ({ OrgGeneralChat: () => <h2>General conversation</h2> }));
vi.mock("@/components/chat/ChatNotificationToggle", () => ({ ChatNotificationToggle: () => null }));
vi.mock("@/components/chat/ChatGroupsPanel", () => ({ ChatGroupsPanel: () => <h2>Group conversations</h2> }));
vi.mock("@/components/organization/JournalEditor", () => ({ JournalEditor: ({ journalType }: any) => <h2>Manual journal {journalType}</h2> }));
vi.mock("@/components/organization/AutoAttendanceJournal", () => ({ AutoAttendanceJournal: () => <h2>Attendance journal</h2> }));
vi.mock("@/components/organization/AutoGradesJournal", () => ({ AutoGradesJournal: () => null }));
vi.mock("@/components/organization/AutoFinalAttestationJournal", () => ({ AutoFinalAttestationJournal: () => null }));
vi.mock("@/components/organization/AutoDocumentRegistrationJournal", () => ({ AutoDocumentRegistrationJournal: () => null }));
vi.mock("@/components/organization/CopiesDuplicatesJournal", () => ({ CopiesDuplicatesJournal: () => null }));
vi.mock("@/components/organization/EducationDocumentsJournal", () => ({ EducationDocumentsJournal: ({ focusEnrollmentId }: any) => <h2>Education journal {focusEnrollmentId}</h2> }));
vi.mock("@/components/organization/JournalCreationWizard", () => ({ JournalCreationWizard: () => null }));
vi.mock("@/components/organization/IdentificationJournal", () => ({ IdentificationJournal: ({ onClose }: any) => <section><h2>Identification journal</h2><button onClick={onClose}>Close journal</button></section> }));
vi.mock("@/components/organization/GroupContextBanner", () => ({ GroupContextBanner: () => null }));

import CompanyDashboard from "@/pages/CompanyDashboard";
import { OrgChatsTab } from "@/components/organization/OrgChatsTab";
import { JournalsManager } from "@/components/organization/JournalsManager";
import { useAdminMarketplace } from "@/hooks/useAdminMarketplace";

function HistoryControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><button onClick={() => navigate(-1)}>Browser Back</button><button onClick={() => navigate(1)}>Browser Forward</button><output data-testid="url">{location.pathname}{location.search}</output></>;
}
async function mount(node: ReactNode, url: string) {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><HistoryControls />{node}</MemoryRouter>);
  });
  return view;
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const heading = (name: string) => screen.getByRole("heading", { name });
function MarketplaceHarness() {
  const h = useAdminMarketplace();
  return <><h2>Marketplace {h.activeTab}</h2><button onClick={() => h.setActiveTab("orders")}>Open orders</button><button onClick={() => h.setActiveTab("import")}>Open import</button></>;
}

beforeEach(() => { localStorage.clear(); backend.profile = null; backend.filters = []; });
afterEach(cleanup);

describe("secondary workspaces retain browser navigation", () => {
  it("restores company sections on Back and Forward", async () => {
    await mount(<CompanyDashboard />, "/company");
    click("Сотрудники"); expect(heading("Company employees")).toBeInTheDocument();
    click("Документы"); expect(heading("Company documents")).toBeInTheDocument();
    click("Browser Back"); expect(heading("Company employees")).toBeInTheDocument();
    click("Browser Back"); expect(heading("Company home")).toBeInTheDocument();
    click("Browser Forward"); expect(heading("Company employees")).toBeInTheDocument();
  });

  it("restores the company screen from a reload URL and rejects an unknown section", async () => {
    const view = await mount(<CompanyDashboard />, "/company?tab=planning");
    expect(heading("Company planning")).toBeInTheDocument();
    view.unmount();
    await mount(<CompanyDashboard />, "/company?tab=unknown");
    expect(heading("Company home")).toBeInTheDocument();
  });

  it("restores marketplace subsections without changing the parent tab", async () => {
    await mount(<MarketplaceHarness />, "/admin?tab=marketplace");
    click("Open orders"); click("Open import");
    click("Browser Back"); expect(heading("Marketplace orders")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("tab=marketplace");
    click("Browser Back"); expect(heading("Marketplace catalog")).toBeInTheDocument();
    click("Browser Forward"); expect(heading("Marketplace orders")).toBeInTheDocument();
    await waitFor(() => expect(heading("Marketplace orders")).toBeInTheDocument());
  });

  it("records opening and closing a journal, then restores it with browser history", async () => {
    await mount(<JournalsManager organizationId="org-1" />, "/organization?tab=journals");
    click("Видеоидентификация"); expect(heading("Identification journal")).toBeInTheDocument();
    click("Browser Back"); expect(screen.queryByRole("heading", { name: "Identification journal" })).not.toBeInTheDocument();
    click("Browser Forward"); expect(heading("Identification journal")).toBeInTheDocument();
    click("Close journal"); expect(screen.queryByRole("heading", { name: "Identification journal" })).not.toBeInTheDocument();
    click("Browser Back"); expect(heading("Identification journal")).toBeInTheDocument();
  });

  it("restores manual journals from URL and keeps them inaccessible in a ready group context", async () => {
    const view = await mount(<JournalsManager organizationId="org-1" />, "/organization?tab=journals&journalView=manual&journalType=attendance");
    expect(heading("Manual journal attendance")).toBeInTheDocument();
    view.unmount();
    backend.profile = [];
    await mount(<JournalsManager organizationId="org-1" groupId="group-1" returnToGroupId="group-1" />, "/organization?tab=journals&groupId=group-1&returnToGroupId=group-1&journalView=manual&journalType=attendance");
    expect(backend.filters).toContainEqual(["student_group_id", "group-1"]);
    expect(screen.queryByRole("heading", { name: "Manual journal attendance" })).not.toBeInTheDocument();
  });

  it("preserves existing focused education-document deep links", async () => {
    await mount(<JournalsManager organizationId="org-1" />, "/organization?tab=documents&documentView=journals&journal=education_documents&educationEnrollmentId=enrollment-1");
    expect(heading("Education journal enrollment-1")).toBeInTheDocument();
  });

  it("returns from an organization conversation to its list and forward to the same learner", async () => {
    await mount(<OrgChatsTab />, "/organization?tab=chats");
    fireEvent.click(screen.getByText("QA Learner"));
    expect(heading("Conversation student-1")).toBeInTheDocument();
    click("Browser Back"); expect(screen.queryByRole("heading", { name: "Conversation student-1" })).not.toBeInTheDocument();
    click("Browser Forward"); expect(heading("Conversation student-1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("url")).toHaveTextContent("chatId=student-1"));
  });

  it("opens a contact chat in one history entry, restoring Contacts on Back", async () => {
    await mount(<OrgChatsTab />, "/organization?tab=chats&chatSection=contacts");
    click("Open contact chat"); expect(heading("Conversation student-1")).toBeInTheDocument();
    click("Browser Back"); expect(screen.getByRole("button", { name: "Open contact chat" })).toBeInTheDocument();
    click("Browser Forward"); expect(heading("Conversation student-1")).toBeInTheDocument();
  });

  it("does not open an unknown or foreign learner from a URL", async () => {
    await mount(<OrgChatsTab />, "/organization?tab=chats&chatId=foreign-1");
    await waitFor(() => expect(backend.filters).toContainEqual(["user_id", "foreign-1"]));
    expect(backend.filters).toContainEqual(["organization_id", "org-1"]);
    expect(screen.queryByRole("heading", { name: "Conversation foreign-1" })).not.toBeInTheDocument();
  });

  it("restores a new organization learner chat before its first message exists", async () => {
    backend.profile = { user_id: "new-student", full_name: "New QA Learner", organization_id: "org-1" };
    await mount(<OrgChatsTab />, "/organization?tab=chats&chatId=new-student");
    await waitFor(() => expect(heading("Conversation new-student")).toBeInTheDocument());
    expect(heading("New QA Learner")).toBeInTheDocument();
  });
});
