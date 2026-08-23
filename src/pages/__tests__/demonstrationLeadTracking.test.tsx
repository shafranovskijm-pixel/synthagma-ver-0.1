import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import DemonstrationPage from "@/pages/DemonstrationPage";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  reachGoal: vi.fn(),
  getUtmData: vi.fn(() => ({
    utm_source: "ya",
    utm_campaign: "syn_search_leads_ru",
    yclid: "click-123",
  })),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock("@/lib/yandexMetrika", () => ({
  reachYandexGoal: mocks.reachGoal,
}));

vi.mock("@/utils/utmCapture", () => ({
  getUtmData: mocks.getUtmData,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock("@/components/landing/LandingHeader", () => ({ LandingHeader: () => null }));
vi.mock("@/components/landing/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/ui/ScrollToTop", () => ({ ScrollToTop: () => null }));
vi.mock("@/components/proposal/ProposalDownloadButton", () => ({
  ProposalDownloadButton: () => null,
}));

beforeAll(() => {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }

  vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <HelmetProvider>
      <DemonstrationPage />
    </HelmetProvider>,
  );
}

function completeRequiredFields() {
  fireEvent.change(screen.getByLabelText(/Имя/), { target: { value: "Ирина" } });
  fireEvent.change(screen.getByLabelText(/Телефон/), { target: { value: "+7 914 000-00-00" } });
}

describe("DemonstrationPage lead confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the Yandex goal only after a persisted lead is confirmed", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        lead_id: "lead-1",
        delivery: { lead: "stored", telegram: "failed", email: "sent" },
      },
      error: null,
    });
    renderPage();
    completeRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));

    expect(await screen.findByText("Спасибо, заявка принята!")).toBeInTheDocument();
    expect(mocks.reachGoal).toHaveBeenCalledWith("demo_request_success");
    expect(mocks.invoke).toHaveBeenCalledWith("submit-demo-request", {
      body: expect.objectContaining({
        name: "Ирина",
        phone: "+7 914 000-00-00",
        tracking: expect.objectContaining({
          utm_campaign: "syn_search_leads_ru",
          yclid: "click-123",
        }),
      }),
    });
  });

  it("keeps the form open and does not report a goal when acceptance fails", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        lead_id: "lead-2",
        delivery: { lead: "failed", telegram: "not_attempted", email: "not_attempted" },
      },
      error: null,
    });
    renderPage();
    completeRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Не удалось отправить заявку. Попробуйте ещё раз.",
      );
    });
    expect(screen.queryByText("Спасибо, заявка принята!")).not.toBeInTheDocument();
    expect(mocks.reachGoal).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Отправить заявку" })).toBeEnabled();
  });
});
