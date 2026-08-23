import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

let granted = new Set<string>();
let visibleTabs = new Set<string>();

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: false,
    can: (permission: string) => granted.has(permission),
    canSeeOrgTab: (tab: string) => visibleTabs.has(tab),
  }),
}));

vi.mock("@/hooks/useDocumentsTab", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useDocumentsTab")>();
  return {
    ...actual,
    useDocumentsTab: (
      _organizationId: string,
      _organizationName: string,
      navigation: {
        activeTab: string;
        onActiveTabChange: (tab: string) => void;
        counterpartySubTab: string;
        onCounterpartySubTabChange: (tab: string) => void;
      },
    ) => ({
      activeTab: navigation.activeTab,
      setActiveTab: navigation.onActiveTabChange,
      counterpartySubTab: navigation.counterpartySubTab,
      setCounterpartySubTab: navigation.onCounterpartySubTabChange,
      invoices: [],
      tabPrefilters: {},
      orgRequisites: null,
    }),
  };
});

vi.mock("@/components/organization/CourseProgramsList", () => ({
  CourseProgramsList: () => <div data-testid="programs-workspace">Programs</div>,
}));
vi.mock("@/components/organization/tabs/documents/DocumentDialogs", () => ({
  DocumentDialogs: () => null,
}));
vi.mock("@/components/organization/documents/TestInboxButton", () => ({
  TestInboxButton: () => <button type="button">Test inbox</button>,
}));

import { DocumentsTab } from "@/components/organization/tabs/DocumentsTab";

function RouterControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
      <button type="button" onClick={() => navigate(-1)}>History back</button>
      <button type="button" onClick={() => navigate(1)}>History forward</button>
    </>
  );
}

function renderDocuments(initialEntry = "/organization?tab=documents") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouterControls />
      <DocumentsTab organizationId="org-1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  granted = new Set(["documents.read"]);
  visibleTabs = new Set(["documents"]);
});

describe("DocumentsTab URL navigation and permissions", () => {
  it("restores the selected workspace on history back/forward and reload", async () => {
    const first = renderDocuments();
    fireEvent.click(screen.getByRole("button", { name: /Документы организации/ }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("documentView=programs"));
    expect(screen.getByTestId("programs-workspace")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "History back" }));
    await waitFor(() => expect(screen.getByTestId("documents-workspace-chooser")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "History forward" }));
    await waitFor(() => expect(screen.getByTestId("programs-workspace")).toBeInTheDocument());

    const reloadUrl = screen.getByTestId("location").textContent!;
    first.unmount();
    renderDocuments(reloadUrl);
    expect(await screen.findByTestId("programs-workspace")).toBeInTheDocument();
  });

  it("hides inaccessible cards and rejects a forbidden direct URL", async () => {
    renderDocuments("/organization?tab=documents&documentView=constructor");

    expect(await screen.findByTestId("documents-workspace-chooser")).toBeInTheDocument();
    expect(screen.queryByText("Ученики и группы")).not.toBeInTheDocument();
    expect(screen.queryByText("Компании и расчёты")).not.toBeInTheDocument();
    expect(screen.queryByText("Настройка документов")).not.toBeInTheDocument();
    expect(screen.queryByText("Журналы")).not.toBeInTheDocument();
    expect(screen.queryByText("ФИС ФРДО")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location")).not.toHaveTextContent("documentView"));
  });
});
