import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrgNotifications } from "./OrgNotifications";
import { StrictMode } from "react";
import { RtnApiError } from "@/api/rostechnadzor";
const mocks = vi.hoisted(() => ({ get: vi.fn(), mark: vi.fn(), notify: vi.fn(), updateEq: vi.fn(), updateIn: vi.fn(), rows: [] as unknown[], actor: "22222222-2222-4222-8222-222222222222", readable: true }));
vi.mock("@/api/rtn-personal-notifications", () => ({ getMyRtnNotifications: mocks.get, markMyRtnNotificationsRead: mocks.mark, notifyRtnPersonalRefresh: mocks.notify, RTN_PERSONAL_REFRESH: "rtn-personal-refresh" }));
const org = "11111111-1111-4111-8111-111111111111", id = "33333333-3333-4333-8333-333333333333", delivery = "44444444-4444-4444-8444-444444444444";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.actor }, loading: false }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ organizationId: org, isOrgOwner: true, orgPermissions: new Set(["courses.read"]), loading: false, error: null, canSeeOrgTab: () => mocks.readable, can: () => mocks.readable }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: vi.fn(),
  auth: { getUser: async () => ({ data: { user: { id: mocks.actor } } }) },
  from: () => { const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: mocks.rows, error: null }), maybeSingle: async () => ({ data: null }), update: () => ({ eq: mocks.updateEq, in: mocks.updateIn }) }; return query; },
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel: vi.fn(),
} }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const page = () => ({ organization_id: org, actor_id: mocks.actor, items: [{ id: delivery, event: { id, title: "Своя публикация Ростехнадзора", own_summary: "Кратко", bank_id: null }, delivered_at: "2026-11-20T10:00:00Z", read_at: null, subscription_generation: 1 }], unread_count: 1, has_more: false, next_before_sequence: null, materialization_pending: false, materialized_count: 0, subscription_generation: 1, subscription_enabled: true, delivery_mode: "own_pull" });
const oldNotification = () => ({ id: "shared-invoice", type: "subscription_expiry", title: "Счёт ожидает оплаты", message: "Подписка", is_read: false, created_at: "2026-11-20T10:00:00Z", related_id: "invoice-one" });
function Probe() { const location = useLocation(); return <output data-testid="location">{location.pathname + location.search}</output>; }
const mount = () => render(<MemoryRouter><Probe /><OrgNotifications organizationId={org} /></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); mocks.actor = "22222222-2222-4222-8222-222222222222"; mocks.readable = true; mocks.rows = []; mocks.get.mockResolvedValue(page()); mocks.mark.mockResolvedValue({ read_event_ids: [id], matched_count: 1 }); mocks.updateEq.mockResolvedValue({ error: null }); mocks.updateIn.mockResolvedValue({ error: null }); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });
afterEach(cleanup);
async function open() { await waitFor(() => expect(mocks.get).toHaveBeenCalled()); fireEvent.click(screen.getByRole("button", { name: /^Уведомления об обучении/ })); await screen.findByText("Своя публикация Ростехнадзора"); }
describe("single existing organization bell with own RTN source", () => {
  it("hides a server-denied RTN source without an unknown badge and keeps old billing usable", async () => {
    mocks.get.mockRejectedValue(new RtnApiError("forbidden", "Нет доступа")); mocks.rows = [oldNotification()]; mount();
    const trigger = await screen.findByRole("button", { name: "Уведомления об обучении" }); fireEvent.click(trigger);
    await screen.findByText("Счёт ожидает оплаты");
    expect(screen.queryByRole("button", { name: /^Ростехнадзор/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Мои уведомления Ростехнадзора" })).not.toBeInTheDocument();
    expect(trigger).not.toHaveAccessibleName(/не подтверждено/); expect(trigger).not.toHaveTextContent("?");
    fireEvent.click(screen.getByRole("button", { name: /Счёт ожидает оплаты/ }));
    await waitFor(() => expect(mocks.updateEq).toHaveBeenCalledWith("id", "shared-invoice")); expect(mocks.mark).not.toHaveBeenCalled();
  });
  it("falls back from an active RTN tab on denial without retaining old items or restoring the stale tab after recovery", async () => {
    mocks.rows = [oldNotification()]; mount(); await open(); fireEvent.click(screen.getByRole("button", { name: "Ростехнадзор 1" }));
    mocks.get.mockRejectedValue(new RtnApiError("forbidden", "Нет доступа")); fireEvent(window, new Event("focus"));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Ростехнадзор/ })).not.toBeInTheDocument());
    expect(screen.queryByText("Своя публикация Ростехнадзора")).not.toBeInTheDocument(); expect(screen.getByText("Счёт ожидает оплаты")).toBeInTheDocument();
    mocks.get.mockResolvedValue(page()); fireEvent(window, new Event("focus"));
    await screen.findByRole("button", { name: "Ростехнадзор 1" }); expect(screen.getByRole("button", { name: "Все 2" })).toHaveAttribute("aria-pressed", "true");
    expect(mocks.mark).not.toHaveBeenCalled();
  });
  it.each(["invalid_response", "unknown"] as const)("keeps the RTN source and unknown badge for %s failures", async code => {
    mocks.get.mockRejectedValue(new RtnApiError(code, "Не подтверждено")); mount();
    const trigger = await screen.findByRole("button", { name: /число личных уведомлений Ростехнадзора ещё не подтверждено/ }); fireEvent.click(trigger);
    await screen.findByText(/Число непрочитанных неизвестно/);
    expect(screen.getByRole("button", { name: "Ростехнадзор" })).toBeInTheDocument();
    expect(screen.queryByText("Непрочитанных полученных: 0.")).not.toBeInTheDocument();
  });
  it("keeps organization rows and loading completion after StrictMode effect replay", async () => {
    mocks.rows = [oldNotification()];
    render(<StrictMode><MemoryRouter><Probe /><OrgNotifications organizationId={org} /></MemoryRouter></StrictMode>);
    await open();
    expect(await screen.findByText("Счёт ожидает оплаты")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Счёт ожидает оплаты/ })).toBeInTheDocument();
  });
  it("uses one bell and marks only the own canonical event before immediate exact navigation", async () => {
    mount(); await open();
    expect(screen.getAllByRole("button", { name: /^Уведомления об обучении/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Своя публикация Ростехнадзора/ }));
    expect(screen.getByTestId("location")).toHaveTextContent(`/organization?tab=courses&courseWorkspace=rtn&rtnView=changes&rtnEventId=${id}`);
    await waitFor(() => expect(mocks.mark).toHaveBeenCalledWith({ organizationId: org, actorId: mocks.actor }, [id]));
    expect(mocks.updateEq).not.toHaveBeenCalled(); expect(mocks.updateIn).not.toHaveBeenCalled();
  });
  it("preserves the old invoice route and old org table read behavior", async () => {
    mocks.rows = [oldNotification()]; mount(); await open();
    fireEvent.click(screen.getByRole("button", { name: /Счёт ожидает оплаты/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/invoice/invoice-one");
    await waitFor(() => expect(mocks.updateEq).toHaveBeenCalledWith("id", "shared-invoice"));
    expect(mocks.mark).not.toHaveBeenCalled();
  });
  it("bulk marks only displayed RTN deliveries without writing shared org is_read", async () => {
    mocks.rows = [oldNotification()]; mount(); await open();
    fireEvent.click(screen.getByRole("button", { name: "Ростехнадзор 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Прочитать показанные" }));
    await waitFor(() => expect(mocks.mark).toHaveBeenCalledWith({ organizationId: org, actorId: mocks.actor }, [id]));
    expect(mocks.updateIn).not.toHaveBeenCalled();
  });
  it("keeps personal unknown status visible rather than displaying a combined false zero", async () => {
    mocks.get.mockRejectedValue(new Error("Нет связи")); mount();
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /число личных уведомлений Ростехнадзора ещё не подтверждено/ }));
    await screen.findByText(/Число непрочитанных неизвестно/);
    expect(screen.getByText("Нет уведомлений организации в этом списке")).toBeInTheDocument();
    expect(screen.queryByText("Непрочитанных полученных: 0.")).not.toBeInTheDocument();
  });
  it("labels pending materialization incomplete even with zero materialized unread", async () => {
    mocks.get.mockResolvedValue({ ...page(), items: [], unread_count: 0, materialization_pending: true }); mount();
    await waitFor(() => expect(mocks.get).toHaveBeenCalled()); fireEvent.click(screen.getByRole("button", { name: /^Уведомления об обучении/ }));
    await screen.findByText(/итоговое число может увеличиться/);
    expect(screen.getByRole("button", { name: "Продолжить проверку событий" })).toBeInTheDocument();
  });
  it("does not read personal metadata without course permission while retaining org billing", async () => {
    mocks.readable = false; mocks.rows = [oldNotification()]; mount();
    fireEvent.click(screen.getByRole("button", { name: "Уведомления об обучении" }));
    await screen.findByText("Счёт ожидает оплаты"); expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Ростехнадзор" })).not.toBeInTheDocument();
  });
  it("resets both old organization rows and personal state when the actor changes", async () => {
    mocks.rows = [oldNotification()]; const view = mount(); await open();
    expect(screen.getByText("Счёт ожидает оплаты")).toBeInTheDocument();
    mocks.actor = "55555555-5555-4555-8555-555555555555"; mocks.rows = [];
    mocks.get.mockReturnValue(new Promise(() => {}));
    view.rerender(<MemoryRouter><Probe /><OrgNotifications organizationId={org} /></MemoryRouter>);
    expect(screen.queryByText("Счёт ожидает оплаты")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Уведомления об обучении/ }));
    await screen.findByText("Проверяем личные уведомления…");
    expect(screen.queryByText("Своя публикация Ростехнадзора")).not.toBeInTheDocument();
    expect(screen.queryByText("Счёт ожидает оплаты")).not.toBeInTheDocument();
  });
});
