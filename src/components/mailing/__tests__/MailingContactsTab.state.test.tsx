import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailingContactsTab } from "../MailingContactsTab";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../ImportContactsDialog", () => ({ ImportContactsDialog: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let key = "";
    const query = {
      select: () => query, limit: () => query,
      eq: (field: string, value: string) => { if (field === "organization_id") key = value; return query; },
      in: (_field: string, ids: string[]) => { key = ids[0]; return query; },
      then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => Promise.resolve(mocks.load(table, key)).then(resolve, reject),
    };
    return query;
  },
} }));
const result = (data: unknown) => ({ data, error: null });
function successfulRead(table: string, key: string) {
  return result(table === "email_campaigns" ? [{ id: key }] : [{ email: `${key}@example.org`, status: "pending", sent_at: null, opened_at: null }]);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockImplementation(async (table, key) => successfulRead(table, key));
});
afterEach(cleanup);

describe("mailing contact reads", () => {
  it.each(["email_campaigns", "email_campaign_recipients"])("reports a failed %s read and retries without fake empty state", async failingTable => {
    let fail = true;
    mocks.load.mockImplementation(async (table, key) => table === failingTable && fail
      ? { data: null, error: { code: "42501" } } : successfulRead(table, key));
    render(<MailingContactsTab organizationId="org-a" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить базу контактов");
    expect(screen.queryByText("Получателей пока нет.")).not.toBeInTheDocument();
    expect(screen.queryByText("Уникальных: 0")).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByText("org-a@example.org")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("handles a thrown network error and stops the loading indicator", async () => {
    mocks.load.mockRejectedValue(new Error("network unavailable"));
    render(<MailingContactsTab organizationId="org-a" />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Загрузка…")).not.toBeInTheDocument();
  });

  it("does not display recipients from a previous organization after a delayed response", async () => {
    let resolve!: (value: unknown) => void;
    const oldRecipients = new Promise(done => { resolve = done; });
    mocks.load.mockImplementation((table, key) => table === "email_campaign_recipients" && key === "org-a"
      ? oldRecipients : Promise.resolve(successfulRead(table, key)));
    const { rerender } = render(<MailingContactsTab organizationId="org-a" />);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith("email_campaign_recipients", "org-a"));
    rerender(<MailingContactsTab organizationId="org-b" />);
    expect(await screen.findByText("org-b@example.org")).toBeInTheDocument();
    await act(async () => { resolve(successfulRead("email_campaign_recipients", "org-a")); });
    expect(screen.queryByText("org-a@example.org")).not.toBeInTheDocument();
    expect(screen.getByText("org-b@example.org")).toBeInTheDocument();
  });
});
