import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsStudentDashboardTab } from "../SettingsStudentDashboardTab";
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), from: vi.fn(), navigate: vi.fn(), canWrite: true, success: vi.fn(), error: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ plan: "standard" }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ can: () => mocks.canWrite, loading: false }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => { throw new Error("Preview must not access Auth"); } }));
vi.mock("../AchievementsManager", () => ({ AchievementsManager: () => null }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.canWrite = true;
  mocks.read.mockResolvedValue({ data: { name: "Учебный центр", branding: { coverUrl: "https://example.test/custom.jpg", coverPosition: "contain", logoUrl: "https://example.test/logo.png" }, student_dashboard_settings: {} }, error: null });
  mocks.save.mockResolvedValue({ data: { id: "org" }, error: null });
  mocks.from.mockReturnValue({
    select: () => ({ eq: () => ({ single: mocks.read }) }),
    update: () => ({ eq: () => ({ select: () => ({ single: mocks.save }) }) }),
  });
});
afterEach(cleanup);

describe("student dashboard safe preview", () => {
  it("opens the unsaved draft with synthetic courses and branding without Auth, navigation or storage changes", async () => {
    localStorage.setItem("adminViewAsStudent", "foreign-student");
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<SettingsStudentDashboardTab organizationId="org" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Просмотр" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Показывать радио" }));
    fireEvent.click(screen.getByRole("button", { name: "Только назначенные" }));
    const snapshot = JSON.stringify(localStorage);
    fireEvent.click(screen.getByRole("button", { name: "Просмотр" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Введение в обучение")).toBeInTheDocument();
    expect(dialog.queryByText("Безопасность на рабочем месте")).not.toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Радио" })).toBeInTheDocument();
    expect(dialog.getByAltText("Обложка организации")).toHaveAttribute("src", "https://example.test/custom.jpg");
    expect(dialog.getByAltText("Обложка организации")).toHaveStyle({ objectFit: "contain" });
    expect(dialog.getByAltText("Логотип организации")).toHaveAttribute("src", "https://example.test/logo.png");
    fireEvent.click(dialog.getByRole("button", { name: "Продолжить" }));
    fireEvent.click(dialog.getByRole("button", { name: "Радио" }));
    expect(dialog.getByRole("status")).toHaveTextContent("Это пример");
    fireEvent.click(dialog.getAllByRole("button", { name: "Чат" })[0]);
    expect(dialog.getByText("Чат с организацией")).toBeInTheDocument();
    expect(dialog.queryByText("ИИ-помощник")).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.stringify(localStorage)).toBe(snapshot);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
    openWindow.mockRestore();
  });
  it("does not report saved settings when the database confirms no organization row", async () => {
    mocks.save.mockResolvedValue({ data: null, error: null });
    render(<SettingsStudentDashboardTab organizationId="org" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить настройки" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Сохранить настройки" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Ошибка сохранения настроек"));
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("explains a catalog enrollment action using local demo state only", async () => {
    render(<SettingsStudentDashboardTab organizationId="org" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Просмотр" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Просмотр" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Оставить заявку" }));
    expect(dialog.getByRole("status")).toHaveTextContent("Это пример");
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("allows a read-only staff preview while disabling shared settings changes", async () => {
    mocks.canWrite = false;
    render(<SettingsStudentDashboardTab organizationId="org" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Просмотр" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Показывать радио" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить настройки" })).toBeDisabled();
  });
});
