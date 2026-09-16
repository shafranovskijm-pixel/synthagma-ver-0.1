import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignEditor } from "../CampaignEditor";
import { buildEditorInitial } from "@/lib/mailing/campaignEditMode";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), insert: vi.fn(), invoke: vi.fn(), getUser: vi.fn(), poolSelect: vi.fn(), poolOrder: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc, functions: { invoke: mocks.invoke }, auth: { getUser: mocks.getUser },
  from: (table: string) => table === "email_sender_pool" ? { select: mocks.poolSelect } : { update: mocks.update, insert: mocks.insert },
} }));
vi.mock("@/hooks/useEmailWarmup", () => ({ useEmailWarmup: () => ({ status: { remaining: 100 }, loading: false, errorKind: null, retry: vi.fn() }) }));
vi.mock("@/lib/emailQuotaGate", () => ({ computeQuotaGate: () => ({ blocksLaunch: false, reason: null }) }));
vi.mock("../CreateWebinarQuick", () => ({ CreateWebinarQuick: () => null }));
vi.mock("../InboxPreview", () => ({ InboxPreview: () => null }));
vi.mock("../WarmupBadge", () => ({ WarmupBadge: () => null }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h1>{children}</h1>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

const initial = buildEditorInitial({
  id: "camp-fixture", name: "Invitation", subject: "Fixture", html_body: "<p>Beta</p>",
  recipient_source: "manual", manual_emails: ["school-a@example.com", "school-b@example.com"],
  recipient_filter: { platform_sender_pool_id: "pool-fixture", future_feature: { keep: true } },
  consent_confirmed_at: null, from_name: "Sender", reply_to: "reply@example.com", status: "draft",
});
const tick = async () => { await act(async () => { vi.advanceTimersByTime(351); }); };
const save = async () => { await act(async () => { fireEvent.click(screen.getByTestId("campaign-save-draft-button")); }); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  const query = { eq: () => query, select: () => query, single: async () => ({ data: { id: "camp-fixture" }, error: null }) };
  mocks.update.mockReturnValue(query);
  mocks.insert.mockReturnValue(query);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-fixture" } } });
  mocks.poolSelect.mockReturnValue({ eq: () => ({ order: mocks.poolOrder }) });
  mocks.poolOrder.mockResolvedValue({ data: [{ id: "pool-fixture", email: "sender@example.com", from_name: "Fixture" }], error: null });
  mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  mocks.rpc.mockResolvedValue({ data: { input_count: 2, eligible_count: 2, duplicate_count: 0, invalid_count: 0, suppressed_count: 0 }, error: null });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const editor = (overrides = {}) => <CampaignEditor open scope="platform" organizationId={null} initial={initial} onClose={vi.fn()} onCreated={vi.fn()} {...overrides} />;

describe("CampaignEditor persisted recipient and consent boundaries", () => {
  it("reopens recipients then saves unrelated changes without overwriting their DB fields", async () => {
    render(editor());
    expect(screen.getByPlaceholderText(/user1@example.com/)).toHaveValue("school-a@example.com\nschool-b@example.com");
    await tick();
    await save();
    const payload = mocks.update.mock.calls[0][0];
    expect(payload).not.toHaveProperty("manual_emails");
    expect(payload).not.toHaveProperty("recipient_source");
    expect(payload.recipient_filter).toEqual(initial.recipientFilter);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("saves an explicitly checked draft flag without sending or forging server consent audit", async () => {
    render(editor());
    await tick();
    fireEvent.click(screen.getByTestId("campaign-consent-checkbox"));
    await save();
    const payload = mocks.update.mock.calls[0][0];
    expect(payload.recipient_filter).toEqual({ ...initial.recipientFilter, draft_consent_confirmed: true });
    expect(payload).not.toHaveProperty("consent_confirmed_at");
    expect(payload).not.toHaveProperty("consent_confirmed_by");
    expect(mocks.rpc.mock.calls.some(([name]) => name === "confirm_campaign_send_consent")).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("resets remembered consent on an explicit list change, preserving historical audit", async () => {
    render(editor({ initial: { ...initial, consentConfirmedAt: "2026-09-01T00:00:00Z" } }));
    await tick();
    expect(screen.getByTestId("campaign-consent-checkbox")).toBeChecked();
    fireEvent.change(screen.getByPlaceholderText(/user1@example.com/), { target: { value: "replacement@example.com" } });
    expect(screen.getByTestId("campaign-consent-checkbox")).not.toBeChecked();
    await save();
    const payload = mocks.update.mock.calls[0][0];
    expect(payload.manual_emails).toEqual(["replacement@example.com"]);
    expect(payload.recipient_filter).toEqual({ ...initial.recipientFilter, draft_consent_confirmed: false });
    expect(payload).not.toHaveProperty("consent_confirmed_at");
  });

  it("allows a draft save after preview failure while launch stays disabled", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    render(editor({ initial: { ...initial, recipientFilter: { ...initial.recipientFilter, draft_consent_confirmed: true } } }));
    await tick();
    expect(screen.getByTestId("campaign-launch-button")).toBeDisabled();
    expect(screen.getByTestId("campaign-save-draft-button")).toBeEnabled();
    await save();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("shows the actual saved platform From independently of Reply-To, never fetches credentials", async () => {
    render(editor());
    await tick();
    expect(screen.getByTestId("campaign-platform-from-summary")).toHaveTextContent("From: sender@example.com");
    expect(mocks.poolSelect).toHaveBeenCalledWith("id,email,from_name");
    await save();
    expect(mocks.update.mock.calls[0][0].recipient_filter.platform_sender_pool_id).toBe("pool-fixture");
    expect(mocks.update.mock.calls[0][0].reply_to).toBe("reply@example.com");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("blocks launch for an unavailable selected pool without silently switching mailbox", async () => {
    mocks.poolOrder.mockResolvedValue({ data: [], error: null });
    render(editor({ initial: { ...initial, recipientFilter: { ...initial.recipientFilter, draft_consent_confirmed: true } } }));
    await tick();
    expect(screen.getByTestId("campaign-launch-button")).toBeDisabled();
    await save();
    expect(mocks.update.mock.calls[0][0].recipient_filter.platform_sender_pool_id).toBe("pool-fixture");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("passes the platform sender gate on an explicit user launch with preview and consent", async () => {
    render(editor({ initial: { ...initial, recipientFilter: { ...initial.recipientFilter, draft_consent_confirmed: true } } }));
    await tick();
    expect(screen.getByTestId("campaign-launch-button")).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByTestId("campaign-launch-button")); });
    expect(mocks.update.mock.calls[0][0].recipient_filter.platform_sender_pool_id).toBe("pool-fixture");
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("run-email-campaign", { body: { campaignId: "camp-fixture", consent_confirmed: true } });
  });
});
