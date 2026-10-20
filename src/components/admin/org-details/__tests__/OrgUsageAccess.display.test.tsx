import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrgSettingsPanel } from "../OrgSettingsPanel";
import { OrgStatsPanel } from "../OrgStatsPanel";
vi.mock("recharts", () => ({ ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>, BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, LineChart: () => null, Line: () => null }));
const save = vi.fn(), retry = vi.fn();
const props = (): ComponentProps<typeof OrgSettingsPanel> => ({
  organizationId: "org", organizationEmail: "synthetic@example.test",
  settings: { name: "Synthetic", email: "synthetic@example.test", phone: "", inn: "", contact_name: "", ai_enabled: true, ai_provider: "gigachat", frdo_enabled: false, storage_limit_bytes: 100, notify_on_limit_80: true, notify_on_limit_exceeded: true },
  setSettings: vi.fn(), isSaving: false, saveSettings: save, accessReady: false, accessError: null, onRetryAccess: retry,
  credentials: null, setCredentials: vi.fn(), showPassword: false, setShowPassword: vi.fn(), generatingCredentials: false, setGeneratingCredentials: vi.fn(), resettingPassword: false, setResettingPassword: vi.fn(),
});
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
describe("admin resource access verification display", () => {
  it.each([null, "Не удалось проверить условия"])("keeps settings save disabled while access is unconfirmed: %s", error => {
    render(<OrgSettingsPanel {...props()} accessError={error} />);
    const button = screen.getByRole("button", { name: "Сохранить все настройки" });
    expect(button).toBeDisabled(); fireEvent.click(button); expect(save).not.toHaveBeenCalled();
    if (error) { fireEvent.click(screen.getByRole("button", { name: "Повторить проверку" })); expect(retry).toHaveBeenCalledExactlyOnceWith(); expect(save).not.toHaveBeenCalled(); }
    else expect(screen.getByRole("status")).toHaveTextContent("Проверяем условия доступа");
  });
  it("does not display infinity as confirmed until the profile and current usage are ready", () => {
    const usageProps = { students: [], courses: [], usage: { storage_bytes: 200, ai_generations_count: 10 }, usageHistory: [], storageLimitPercent: 0, aiGenerationsLimit: Infinity, aiGenerationsPercent: 0, formatBytes: (bytes: number) => `${bytes} Б`, storageLimit: -1 };
    const view = render(<OrgStatsPanel {...usageProps} usageLimitsReady={false} />);
    expect(screen.getAllByText(/Проверяем…/)).toHaveLength(2);
    expect(screen.queryByText(/∞/)).not.toBeInTheDocument();
    view.rerender(<OrgStatsPanel {...usageProps} usageLimitsReady />);
    expect(screen.getAllByText(/∞/)).toHaveLength(2);
  });
});
