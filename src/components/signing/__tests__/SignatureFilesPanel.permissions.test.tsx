import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignatureFilesPanel } from "../SignaturesJournal";
const m = vi.hoisted(() => ({ canSign: false, canSalesWrite: false, rpc: vi.fn(), fetch: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "sender" } }) }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ actorId: 'sender', revision: 1 }), captureOfflineAuthRevision: () => 1, isOfflineActorCurrent: (id: string, revision: number) => id === 'sender' && revision === 1 }));
vi.mock("@/hooks/useDocumentActionPermissions", () => ({ useDocumentActionPermissions: () => ({ canSign: m.canSign, canSalesWrite: m.canSalesWrite }) }));
vi.mock("@/components/signing/SignatureRevisionUploader", () => ({ SignatureRevisionUploader: () => null }));
vi.mock("@/components/signing/BulkSendForSigningDialog", () => ({ BulkSendForSigningDialog: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'sender' }, access_token: 'original-jwt' } }, error: null }), getUser: async () => ({ data: { user: { id: 'sender' } }, error: null }) }, rpc: m.rpc, from: () => {
  const chain: any = new Proxy({}, { get: (_, key) => key === "then" ? (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) : () => chain });
  return chain;
} } }));
const panel = (props = {}) => <SignatureFilesPanel signatureId="signature" organizationId="org" senderUserId="sender" documentType="external_upload" status="signed" requiresBilateral onChanged={() => {}} {...props} />;
describe("sender countersign gate", () => {
  beforeEach(() => { vi.clearAllMocks(); m.canSign = false; m.canSalesWrite = false; m.rpc.mockResolvedValue({ error: null }); m.fetch.mockResolvedValue({ json: async () => ({ ip: "127.0.0.1" }) }); vi.stubGlobal("fetch", m.fetch); });
  it("disables signature and does not even fetch IP for a writer without sign rights", async () => {
    render(panel()); await screen.findByText("Версий нет");
    const button = screen.getByRole("button", { name: "Подписать с моей стороны" });
    expect(button).toBeDisabled(); fireEvent.click(button);
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
  });
  it("does not sign someone else's document even with sign permission", async () => {
    m.canSign = true; render(panel({ senderUserId: "other" })); await screen.findByText("Версий нет");
    expect(screen.getByRole("button", { name: "Подписать с моей стороны" })).toBeDisabled();
  });
  it("keeps an authorized sender's countersign path", async () => {
    m.canSign = true; render(panel()); await screen.findByText("Версий нет");
    fireEvent.click(screen.getByRole("button", { name: "Подписать с моей стороны" }));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("sender_countersign", expect.objectContaining({ p_signature_id: "signature" })));
  });
  it("keeps the narrow commercial sender exception, not arbitrary document types", async () => {
    m.canSalesWrite = true; const { rerender } = render(panel()); await screen.findByText("Версий нет");
    expect(screen.getByRole("button", { name: "Подписать с моей стороны" })).not.toBeDisabled();
    rerender(panel({ documentType: "order" }));
    expect(screen.getByRole("button", { name: "Подписать с моей стороны" })).toBeDisabled();
  });
});
