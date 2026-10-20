import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ actor: "actor-a", permissionOrg: "org-a" }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: auth.actor }, userRole: "organization", loading: false }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ loading: false, error: null, organizationId: auth.permissionOrg, isOrgOwner: false, orgPermissions: new Set(["journals.read"]), can: (permission: string) => permission === "journals.read" }) }));
vi.mock("@/utils/xlsxHelper", () => ({ getXLSX: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { CopiesDuplicatesJournal } from "../CopiesDuplicatesJournal";

beforeEach(() => { localStorage.clear(); auth.actor = "actor-a"; auth.permissionOrg = "org-a"; });
afterEach(cleanup);

describe("copy journal error surface", () => {
  it("shows a clear unreadable-source error with no add/export/delete controls and preserves the exact bytes", () => {
    const raw = "{broken-original"; localStorage.setItem("copies_duplicates_org-a", raw);
    render(<CopiesDuplicatesJournal organizationId="org-a" onClose={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Исходные данные сохранены без изменений");
    expect(screen.queryByText("Добавить")).not.toBeInTheDocument(); expect(screen.queryByText("Экспорт в Excel")).not.toBeInTheDocument();
    expect(screen.queryByText("Удалить")).not.toBeInTheDocument();
    expect(localStorage.getItem("copies_duplicates_org-a")).toBe(raw);
  });

  it("does not show the previous organization's recipient when B has an unreadable source", () => {
    const year = new Date().getFullYear();
    const row = { id: "old-id", reg_number: "old-number", recipient_name: "Synthetic A recipient", original_document_type: "certificate", original_document_number: "original", original_issue_date: `${year}-01-02`, copy_type: "copy", issue_date: `${year}-01-03`, issue_reason: "lost", notes: null };
    localStorage.setItem("copies_duplicates_org-a", JSON.stringify([row])); localStorage.setItem("copies_duplicates_org-b", "null");
    const page = render(<CopiesDuplicatesJournal organizationId="org-a" onClose={vi.fn()} />);
    expect(screen.getByText(row.recipient_name)).toBeInTheDocument();
    auth.permissionOrg = "org-b"; page.rerender(<CopiesDuplicatesJournal organizationId="org-b" onClose={vi.fn()} />);
    expect(screen.queryByText(row.recipient_name)).not.toBeInTheDocument(); expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(localStorage.getItem("copies_duplicates_org-a")).toBe(JSON.stringify([row])); expect(localStorage.getItem("copies_duplicates_org-b")).toBe("null");
  });
});
