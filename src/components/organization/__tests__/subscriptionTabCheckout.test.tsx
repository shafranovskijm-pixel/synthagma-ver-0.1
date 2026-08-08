import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";

/** Regression на РЕАЛЬНУЮ вкладку тарифа: клики должны открывать один мастер «Оформление тарифа». */

const setActiveTab = vi.fn();

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: "11111111-1111-4111-8111-111111111111",
    tabNavigation: { setActiveTab },
  }),
}));

vi.mock("@/hooks/usePlatformCommercialSet", () => ({
  usePlatformCommercialSet: () => ({
    set: { contract: null, invoice: null, act: null },
    loading: false,
    error: null,
    reload: vi.fn(async () => {}),
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: (r: any) => Promise.resolve({ data: [], error: null }).then(r),
  };
  return {
    supabase: {
      from: () => chain,
      functions: { invoke: async () => ({ data: null, error: null }) },
      auth: { getUser: async () => ({ data: { user: null } }) },
    },
  };
});

vi.mock("@/hooks/useSubscriptionTab", async () => {
  const actual = await vi.importActual<any>("@/hooks/useSubscriptionTab");
  return {
    ...actual,
    useSubscriptionTab: () => ({
      subscriptionLimits: {
        plan: "free",
        limits: { maxCourses: 1, maxStudents: 10, maxStorageMb: 100, maxTrainedPerMonth: 5 },
        usage: { coursesCount: 0, studentsCount: 0, storageUsedMb: 0, trainedThisMonth: 0 },
      },
      currentPlan: "free",
      currentPlanInfo: SUBSCRIPTION_PLANS.free,
      currentPlanIndex: 0,
      paidUntil: null,
      tariffCustomLabel: null,
      daysRemaining: null,
      urgencyColor: "muted",
      pendingRequest: null,
      customEnabledCategories: [],
      showUpgradeDialog: false,
      setShowUpgradeDialog: vi.fn(),
      selectedPlan: null,
      setSelectedPlan: vi.fn(),
      message: "",
      setMessage: vi.fn(),
      submitting: false,
      payingOnline: false,
      generatingInvoice: false,
      coursesPercent: 0,
      studentsPercent: 0,
      trainedPercent: 0,
      handleRequestUpgrade: vi.fn(),
      handleGenerateInvoice: vi.fn(),
      handlePayOnline: vi.fn(),
    }),
  };
});

import { SubscriptionTab } from "@/components/organization/SubscriptionTab";

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.search}</span>;
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={["/organization?tab=subscription"]}>
      <LocationProbe />
      <Routes>
        <Route path="/organization" element={<SubscriptionTab />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function expectSingleWizard() {
  await waitFor(() => expect(screen.getAllByText("Оформление тарифа")).toHaveLength(1));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/Шаг 1 из 3/)).toBeTruthy();
  return dialog;
}

beforeEach(() => {
  setActiveTab.mockClear();
});

describe("SubscriptionTab — открытие мастера", () => {
  it("«Оформить тариф» открывает один мастер с дефолтом Старт", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Оформить тариф/ }));
    await expectSingleWizard();
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain("checkout=1"));
    expect(screen.getByTestId("loc").textContent).toContain("plan=start");
  });

  it("повторный клик не открывает второй мастер", async () => {
    renderTab();
    const btn = screen.getByRole("button", { name: /Оформить тариф/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await expectSingleWizard();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("каждая «Перейти» открывает мастер с нужным тарифом", async () => {
    renderTab();
    const upgrades = screen.getAllByRole("button", { name: /Перейти/ });
    expect(upgrades.length).toBeGreaterThanOrEqual(4);

    for (const [index, plan] of (["start", "standard", "professional", "maximum"] as const).entries()) {
      fireEvent.click(upgrades[index]);
      const dialog = await expectSingleWizard();
      expect(within(dialog).getByText(SUBSCRIPTION_PLANS[plan].name)).toBeTruthy();
      await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain(`plan=${plan}`));
      fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByTestId("loc").textContent).toContain("tab=subscription");
      expect(screen.getByTestId("loc").textContent).not.toContain("checkout=1");
    }
  });
});
