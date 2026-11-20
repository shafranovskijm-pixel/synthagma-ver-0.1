import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RtnPersonalPreferences } from "./RtnPersonalPreferences";
import { RtnApiError } from "@/api/rostechnadzor";
const api = vi.hoisted(() => ({ getMyRtnSubscription: vi.fn(), saveMyRtnSubscription: vi.fn(), notifyRtnPersonalRefresh: vi.fn() }));
vi.mock("@/api/rtn-personal-notifications", () => api);
const org = "11111111-1111-4111-8111-111111111111", actor = "22222222-2222-4222-8222-222222222222", other = "33333333-3333-4333-8333-333333333333";
const props = { organizationId: org, actorId: actor };
const value = () => ({ organization_id: org, actor_id: actor, delivery_mode: "own_pull", options: { topics: ["general"], kinds: ["news", "source_change", "bank_release"] }, subscription: { enabled: false, effective_enabled: false, needs_reconfiguration: false, topics: [], kinds: [], generation: 0, enabled_since: null, updated_at: null } });
const enabled = () => ({ ...value(), subscription: { ...value().subscription, enabled: true, effective_enabled: true, topics: ["general"], kinds: ["news"], generation: 1, enabled_since: "2026-11-20T10:00:00Z", updated_at: "2026-11-20T10:00:00Z" } });
beforeEach(() => { vi.resetAllMocks(); api.getMyRtnSubscription.mockResolvedValue(value()); api.saveMyRtnSubscription.mockResolvedValue(enabled()); });
afterEach(cleanup);
describe("own RTN notification preferences", () => {
  it("confirms default off without any save or automatic selection", async () => {
    render(<RtnPersonalPreferences {...props} />);
    expect(await screen.findByRole("checkbox", { name: "Получать уведомления в колокольчике" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Общие новости Ростехнадзора" })).not.toBeChecked();
    expect(api.saveMyRtnSubscription).not.toHaveBeenCalled();
  });
  it("requires explicit topic and kind choices before enabling and saves the exact CAS generation", async () => {
    render(<RtnPersonalPreferences {...props} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Получать уведомления в колокольчике" }));
    expect(screen.getByRole("button", { name: "Сохранить мои уведомления" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Общие новости Ростехнадзора" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Новости официального сайта" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить мои уведомления" }));
    await screen.findByText(/Личные уведомления включены для будущих событий/);
    expect(api.saveMyRtnSubscription).toHaveBeenCalledWith(props, { enabled: true, topics: ["general"], kinds: ["news"], expectedGeneration: 0 });
    expect(api.notifyRtnPersonalRefresh).toHaveBeenCalledWith(props, 1);
  });
  it("blocks a CAS conflict until the user explicitly refreshes, without an automatic overwrite", async () => {
    api.saveMyRtnSubscription.mockRejectedValue(new RtnApiError("conflict", "Настройки изменены в другом окне."));
    render(<RtnPersonalPreferences {...props} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Общие новости Ростехнадзора" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить мои уведомления" }));
    await screen.findByRole("alert");
    expect(api.getMyRtnSubscription).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Сохранить мои уведомления" })).toBeDisabled();
    api.getMyRtnSubscription.mockResolvedValue(enabled());
    fireEvent.click(screen.getByRole("button", { name: "Загрузить актуальные настройки" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Получать уведомления в колокольчике" })).toBeChecked());
    expect(api.saveMyRtnSubscription).toHaveBeenCalledTimes(1);
  });
  it("disables future delivery while explaining that own history stays", async () => {
    api.getMyRtnSubscription.mockResolvedValue(enabled());
    api.saveMyRtnSubscription.mockResolvedValue({ ...value(), subscription: { ...value().subscription, generation: 2, topics: ["general"], kinds: ["news"], updated_at: "2026-11-20T10:00:00Z" } });
    render(<RtnPersonalPreferences {...props} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Получать уведомления в колокольчике" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить мои уведомления" }));
    await screen.findByText("Новые уведомления отключены. Уже полученные останутся в истории.");
    expect(api.saveMyRtnSubscription.mock.calls[0][1]).toMatchObject({ enabled: false, expectedGeneration: 1 });
  });
  it("does not turn an unavailable preference into a default-off editable form", async () => {
    api.getMyRtnSubscription.mockRejectedValue(new RtnApiError("unknown", "Личные уведомления пока недоступны."));
    render(<RtnPersonalPreferences {...props} />);
    await screen.findByRole("alert"); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(api.saveMyRtnSubscription).not.toHaveBeenCalled();
  });
  it("does not apply an old actor preference after an actor switch", async () => {
    let finish!: (v: unknown) => void;
    api.getMyRtnSubscription.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(value());
    const view = render(<RtnPersonalPreferences {...props} />); view.rerender(<RtnPersonalPreferences {...props} actorId={other} />);
    await screen.findByRole("checkbox", { name: "Получать уведомления в колокольчике" }); finish(enabled());
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Получать уведомления в колокольчике" })).not.toBeChecked());
  });
});
