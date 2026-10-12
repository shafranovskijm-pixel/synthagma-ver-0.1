import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailingOverviewTab } from "../MailingOverviewTab";

const mocks = vi.hoisted(() => ({
  read: vi.fn(), retrySmtp: vi.fn(), smtpError: null as string | null,
  mail: vi.fn(), warmup: vi.fn(), contacts: vi.fn(), campaign: vi.fn(),
}));
vi.mock("@/hooks/useOrgSmtp", () => ({ useOrgSmtp: () => ({ settings: null, loading: false, loadErrorKind: mocks.smtpError, retryLoad: mocks.retrySmtp }) }));
vi.mock("@/hooks/useEmailCampaigns", () => ({ useEmailCampaigns: () => ({ campaigns: [], loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: () => query, order: () => query, limit: mocks.read };
  return query;
} } }));
const mount = () => render(<MailingOverviewTab organizationId="org" onGoToSenders={mocks.mail} onGoToWarmup={mocks.warmup} onGoToContacts={mocks.contacts} onNewCampaign={mocks.campaign} />);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.smtpError = null;
  mocks.read.mockResolvedValue({ data: [], error: null });
});
afterEach(cleanup);

describe("mailing setup overview", () => {
  it("opens each existing workspace from the four-step preparation path", async () => {
    mount();
    for (const [label, callback] of [["1. Почта", mocks.mail], ["2. Прогрев", mocks.warmup], ["3. База", mocks.contacts], ["4. Кампания", mocks.campaign]] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(callback).toHaveBeenCalledOnce();
    }
    await screen.findByText(/Нет включённого отправителя/);
  });

  it("shows a retry on denied sender reads instead of claiming the mailbox is missing", async () => {
    mocks.read.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось проверить отправителей");
    expect(screen.queryByText(/Нет включённого отправителя/)).not.toBeInTheDocument();
    mocks.read.mockResolvedValue({ data: [{ label: "Почта школы", from_email: "sender@example.org" }], error: null });
    fireEvent.click(screen.getByRole("button", { name: "Повторить проверку" }));
    await waitFor(() => expect(screen.getByTestId("mailing-sender-ready")).toHaveTextContent("Почта школы"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.retrySmtp).toHaveBeenCalledOnce();
  });
});
