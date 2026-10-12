import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AcceptInvitation from "@/pages/AcceptInvitation";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  getSession: vi.fn(),
  replace: vi.fn(),
  refreshUserRole: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    auth: { getSession: mocks.getSession },
  },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "existing-student" },
    userRole: "student",
    loading: false,
    refreshUserRole: mocks.refreshUserRole,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderInvitation() {
  return render(
    <MemoryRouter initialEntries={["/accept-invitation?token=test-invitation"]}>
      <Routes>
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/organization" element={
          <ProtectedRoute requiredRole="organization"><p>Organization dashboard</p></ProtectedRoute>
        } />
        <Route path="/student" element={<p>Old student dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function acceptInvitation() {
  const accept = await screen.findByRole("button", { name: "Принять приглашение" });
  vi.useFakeTimers();
  await act(async () => { fireEvent.click(accept); });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [{
    email: "employee@example.test",
    invitation_type: "organization",
    full_name: "Test Employee",
    accepted_at: null,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }], error: null });
  mocks.getSession.mockResolvedValue({ data: { session: {
    user: { id: "existing-student", email: "employee@example.test" },
  } } });
  mocks.invoke.mockResolvedValue({ data: { success: true, redirect: "/organization" }, error: null });
  // jsdom intentionally prevents real navigation. Keep its DOM/window methods
  // and intercept only the full-document navigation boundary.
  const originalWindow = window;
  vi.stubGlobal("window", new Proxy(originalWindow, {
    get(target, key) {
      if (key === "location") return { ...target.location, replace: mocks.replace };
      return Reflect.get(target, key, target);
    },
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("staff invitation navigation", () => {
  it("reloads the document after acceptance instead of entering a route with the cached student role", async () => {
    renderInvitation();
    await acceptInvitation();

    expect(mocks.invoke).toHaveBeenCalledWith("accept-staff-invitation", {
      body: { token: "test-invitation" },
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1500); });

    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/organization");
    expect(screen.queryByText("Old student dashboard")).not.toBeInTheDocument();
  });

  it("offers a native link so immediate navigation also reloads roles and permissions", async () => {
    renderInvitation();
    await acceptInvitation();

    const link = screen.getByRole("link", { name: "Перейти сейчас" });
    expect(link).toHaveAttribute("href", "/organization");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    // Prevent jsdom's default navigation only after React has handled the click.
    let interceptedByRouter = true;
    const observeDefault = (event: Event) => {
      interceptedByRouter = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", observeDefault, { once: true });
    act(() => { link.dispatchEvent(click); });
    expect(interceptedByRouter).toBe(false);
    expect(screen.queryByText("Old student dashboard")).not.toBeInTheDocument();
  });

  it("does not navigate when the server rejects the invitation", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "Приглашение отозвано", code: "REVOKED" }, error: null });
    renderInvitation();
    await acceptInvitation();
    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(screen.getByText("Приглашение отозвано")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Перейти сейчас" })).not.toBeInTheDocument();
  });

  it("cancels delayed navigation when the page is left", async () => {
    const view = renderInvitation();
    await acceptInvitation();
    view.unmount();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("never follows an external redirect returned by the endpoint", async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true, redirect: "https://external.example.test/" }, error: null });
    renderInvitation();
    await acceptInvitation();
    expect(screen.getByRole("link", { name: "Перейти сейчас" })).toHaveAttribute("href", "/");
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/");
  });
});
