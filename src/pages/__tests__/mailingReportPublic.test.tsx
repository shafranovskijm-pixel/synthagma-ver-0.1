import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import MailingReportPublic from "@/pages/MailingReportPublic";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

const renderAt = (token: string) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/mailing/report/${token}`]}>
        <Routes>
          <Route path="/mailing/report/:token" element={<MailingReportPublic />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

const AGGREGATES = {
  valid: true,
  campaign_name: "Летняя рассылка",
  subject: "Обучение по охране труда",
  status: "completed",
  started_at: "2026-05-01T09:00:00Z",
  completed_at: "2026-05-01T10:00:00Z",
  total_recipients: 100,
  accepted: 95,
  failed: 5,
  bounced: 2,
  opened: 40,
  clicked: 12,
  unsubscribed: 1,
  expires_at: "2026-06-01T10:00:00Z",
};

describe("публичный отчёт /mailing/report/:token", () => {
  beforeEach(() => rpc.mockReset());

  it("рендерит только агрегаты и не содержит PII", async () => {
    rpc.mockResolvedValue({ data: AGGREGATES, error: null });
    const { container } = renderAt("tok-1");

    await waitFor(() => expect(screen.getByTestId("report-metrics")).toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith("get_mailing_report_by_token", { p_token: "tok-1" });

    const text = container.textContent || "";
    expect(text).toContain("Летняя рассылка");
    expect(text).not.toMatch(/@/); // ни одного email на странице
    expect(text).not.toMatch(/Иванов|SMTP error|550/);
    expect(text).toContain("Принято SMTP");
  });

  it("показывает безопасное состояние для истёкшего/отозванного токена", async () => {
    rpc.mockResolvedValue({ data: { valid: false, reason: "expired" }, error: null });
    renderAt("tok-expired");
    await waitFor(() => expect(screen.getByTestId("report-invalid")).toBeInTheDocument());
    expect(screen.queryByTestId("report-metrics")).not.toBeInTheDocument();
  });

  it("не раскрывает данные при ошибке RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    renderAt("tok-bad");
    await waitFor(() => expect(screen.getByTestId("report-invalid")).toBeInTheDocument());
  });
});
