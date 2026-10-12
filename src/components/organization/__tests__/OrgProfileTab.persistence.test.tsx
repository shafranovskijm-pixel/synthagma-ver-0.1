import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrgProfileTab } from "../tabs/OrgProfileTab";

const mocks = vi.hoisted(() => ({
  user: { id: "staff" }, branding: vi.fn(), save: vi.fn(), update: vi.fn(),
  success: vi.fn(), error: vi.fn(), resetMenu: vi.fn(), section: "theme",
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/useUrlNavigation", () => ({ useUrlQueryState: () => [mocks.section, vi.fn()] }));
vi.mock("@/hooks/useOrgTheme", () => ({ useOrgTheme: () => ({ theme: {}, saveTheme: vi.fn() }), applyOrgTheme: vi.fn() }));
vi.mock("@/hooks/useDashboardSettings", () => ({ defaultMenuSettings: {}, useDashboardSettings: () => ({ menuSettings: {}, resetMenuSettings: mocks.resetMenu }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/components/organization/PartnerCabinet", () => ({ PartnerCabinet: () => null }));
vi.mock("@/components/ui/ThemePersonalization", () => ({ ThemePersonalization: () => null }));
vi.mock("@/components/ui/ThemeSelector", () => ({ ThemeSelector: () => null }));
vi.mock("@/components/organization/ProfileBrandingTab", () => ({ ProfileBrandingTab: () => null }));
vi.mock("@/components/organization/ProfileLoginBrandingTab", () => ({ ProfileLoginBrandingTab: () => null }));
vi.mock("@/components/organization/SettingsStudentDashboardTab", () => ({ SettingsStudentDashboardTab: () => null }));
vi.mock("@/components/organization/StaffManager", () => ({ StaffManager: () => null }));
vi.mock("@/components/organization/OrgShowcaseAndTelegramSection", () => ({ OrgShowcaseAndTelegramSection: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [], error: null }),
  from: (table: string) => ({
    select: (columns: string) => ({ eq: () => {
      if (table === "notification_preferences") return Promise.resolve({ data: [], error: null });
      const read = table === "organizations" && columns === "branding"
        ? mocks.branding : async () => ({ data: null, error: null });
      return { single: read, maybeSingle: read };
    } }),
    update: (value: unknown) => {
      mocks.update(value);
      return { eq: () => ({ select: () => ({ single: mocks.save }) }) };
    },
  }),
} }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.section = "theme";
  mocks.branding.mockResolvedValue({ data: { branding: { logo_url: "https://example.com/logo.png", color: "blue" } }, error: null });
  mocks.save.mockResolvedValue({ data: { id: "org" }, error: null });
  mocks.resetMenu.mockResolvedValue(false);
});
afterEach(cleanup);

describe("organization settings save feedback", () => {
  it("keeps the icon visible and reports failure when the server changes no row", async () => {
    mocks.save.mockResolvedValue({ data: null, error: null });
    render(<OrgProfileTab organizationId="org" />);
    await screen.findByAltText("Значок");
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Не удалось удалить значок", expect.anything()));
    expect(screen.getByAltText("Значок")).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not overwrite branding when its current value cannot be read", async () => {
    render(<OrgProfileTab organizationId="org" />);
    await screen.findByAltText("Значок");
    mocks.branding.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByAltText("Значок")).toBeInTheDocument();
  });

  it("clears both supported icon fields only on confirmed removal, retaining other branding", async () => {
    render(<OrgProfileTab organizationId="org" />);
    await screen.findByAltText("Значок");
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Значок удалён"));
    expect(mocks.update).toHaveBeenCalledWith({ branding: { logoUrl: "", logo_url: "", color: "blue" } });
    expect(screen.queryByAltText("Значок")).not.toBeInTheDocument();
  });

  it("reports a rejected menu reset without a success message", async () => {
    mocks.section = "menu";
    render(<OrgProfileTab organizationId="org" />);
    fireEvent.click(screen.getByRole("button", { name: "По умолчанию" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Не удалось восстановить меню"));
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
