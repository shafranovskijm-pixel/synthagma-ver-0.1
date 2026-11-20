import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({
  loading: false, error: null as string | null, canRead: true, workspace: "org-a" as string | null, owner: false,
  read: vi.fn(),
}));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({
  loading: model.loading, error: model.error, can: (p: string) => model.canRead && p === "billing.read", organizationId: model.workspace, isOrgOwner: model.owner,
}) }));
vi.mock("@/lib/notifications/organizationPaymentNotice", () => ({ readOrganizationPaymentNotice: (...args: unknown[]) => model.read(...args) }));
import { OrganizationPaymentNoticeBanner } from "../OrganizationPaymentNoticeBanner";

const notice = (org = "org-a") => ({ organizationId: org, id: "notice", title: "Оплатите доступ до 20 ноября", message: `Счёт организации ${org}. Старый документ сохранён.`, path: "/invoice/existing-invoice" });
const view = (org = "org-a") => <MemoryRouter><OrganizationPaymentNoticeBanner organizationId={org} /></MemoryRouter>;

beforeEach(() => {
  model.loading = false; model.error = null; model.canRead = true; model.workspace = "org-a"; model.owner = false;
  model.read.mockReset().mockResolvedValue(notice());
});

describe("persistent organization payment banner boundaries", () => {
  it("shows stored wording and a real invoice link without marking the notice read or offering payment/hold actions", async () => {
    render(view());
    expect(await screen.findByRole("status")).toHaveTextContent("Оплатите доступ до 20 ноября");
    expect(screen.getByRole("link", { name: "Открыть счёт" })).toHaveAttribute("href", "/invoice/existing-invoice");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(model.read).toHaveBeenCalledTimes(1);
  });
  it.each(["loading", "denied", "foreign-workspace", "error"])("makes no financial reads with %s permissions", async mode => {
    model.loading = mode === "loading"; model.canRead = mode !== "denied";
    if (mode === "foreign-workspace") model.workspace = "org-b";
    if (mode === "error") model.error = "unavailable";
    const { container } = render(view());
    expect(container).toBeEmptyDOMElement();
    expect(model.read).not.toHaveBeenCalled();
  });
  it("supports the existing platform administrator's normal organization preview", async () => {
    model.workspace = null; model.owner = true;
    render(view());
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
  it("hides old financial details immediately when workspace changes and ignores the stale response", async () => {
    let finish: (value: unknown) => void = () => {};
    model.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { rerender, container } = render(view());
    model.workspace = "org-b";
    model.read.mockResolvedValueOnce(notice("org-b"));
    rerender(view("org-b"));
    await screen.findByRole("status");
    await act(async () => { finish(notice("org-a")); });
    expect(container.querySelector('[role="status"]')).toHaveTextContent("Счёт организации org-b");
    expect(container.querySelector('[role="status"]')).not.toHaveTextContent("Счёт организации org-a");
    expect(model.read).toHaveBeenLastCalledWith("org-b");
    model.canRead = false;
    rerender(view("org-b"));
    expect(container).toBeEmptyDOMElement();
  });
  it("removes a no-longer-pending reminder on focus without a polling loop", async () => {
    render(view());
    await screen.findByRole("status");
    model.read.mockResolvedValueOnce(null);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(model.read).toHaveBeenCalledTimes(2);
  });
  it("coalesces focus and visibility events while the same refresh is pending", async () => {
    let finish: (value: unknown) => void = () => {};
    model.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(view());
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(model.read).toHaveBeenCalledTimes(1);
    await act(async () => { finish(notice()); });
    await screen.findByRole("status");
    model.read.mockResolvedValueOnce(null);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(model.read).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("hides failed refreshes and logs no server data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    model.read.mockRejectedValue(new Error("private response with identifiers"));
    render(view());
    await waitFor(() => expect(warn).toHaveBeenCalledWith("[OrganizationPaymentNotice]", { stage: "read", code: "unavailable" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private response");
    warn.mockRestore();
  });
});
