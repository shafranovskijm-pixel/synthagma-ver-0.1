import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import TariffNavigationHarness from "@/pages/dev/TariffNavigationHarness";
import {
  checkoutParams,
  resolveCheckoutState,
  subscriptionTabPath,
} from "@/lib/organization/subscriptionNavigation";

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname + loc.search}</span>;
}

function renderHarness(initial = "/dev/tariff-harness?tab=subscription") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <LocationProbe />
      <Routes>
        <Route path="/dev/tariff-harness" element={<TariffNavigationHarness />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("навигация к тарифу", () => {
  it("даёт тот же путь, что рабочий верхний бейдж", () => {
    expect(subscriptionTabPath()).toBe("/organization?tab=subscription");
    expect(subscriptionTabPath({ checkout: true, plan: "standard" })).toBe(
      "/organization?tab=subscription&checkout=1&plan=standard",
    );
  });

  it("читает состояние мастера из URL и падает в start при мусоре", () => {
    expect(resolveCheckoutState("tab=subscription&checkout=1&plan=maximum")).toEqual({ open: true, plan: "maximum" });
    expect(resolveCheckoutState("tab=subscription&checkout=1&plan=basic")).toEqual({ open: true, plan: "start" });
    expect(resolveCheckoutState("tab=subscription").open).toBe(false);
  });

  it("закрытие сохраняет вкладку тарифа и снимает параметры мастера", () => {
    const closed = checkoutParams("tab=subscription&checkout=1&plan=standard", { open: false });
    expect(closed.get("tab")).toBe("subscription");
    expect(closed.get("checkout")).toBeNull();
    expect(closed.get("plan")).toBeNull();
  });
});

describe("клики мастера «Оформление тарифа»", () => {
  it("«Оформить тариф» открывает мастер с дефолтом Старт", async () => {
    renderHarness();
    expect(screen.queryByText("Оформление тарифа")).toBeNull();
    fireEvent.click(screen.getByTestId("open-checkout"));
    await waitFor(() => expect(screen.getByText("Оформление тарифа")).toBeTruthy());
    expect(screen.getByText(/Шаг 1 из 3/)).toBeTruthy();
    expect(screen.getByTestId("checkout-state").textContent).toContain("plan=start");
    expect(screen.getByTestId("loc").textContent).toContain("checkout=1&plan=start");
  });

  it.each(["start", "standard", "professional", "maximum"] as const)(
    "«Перейти» открывает мастер с тарифом %s",
    async (plan) => {
      renderHarness();
      fireEvent.click(screen.getByTestId(`upgrade-${plan}`));
      await waitFor(() => expect(screen.getByText("Оформление тарифа")).toBeTruthy());
      expect(screen.getByTestId("checkout-state").textContent).toContain(`plan=${plan}`);
      expect(screen.getByTestId("loc").textContent).toContain(`plan=${plan}`);
    },
  );

  it("повторный клик не открывает второй диалог", async () => {
    renderHarness();
    const btn = screen.getByTestId("open-checkout");
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
  });

  it("выбранный тариф восстанавливается из URL после hot reload", async () => {
    renderHarness("/dev/tariff-harness?tab=subscription&checkout=1&plan=professional");
    await waitFor(() => expect(screen.getByText("Оформление тарифа")).toBeTruthy());
    expect(screen.getByTestId("checkout-state").textContent).toContain("plan=professional");
  });
});
