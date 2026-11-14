import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: transport.invoke } } }));
import { checkRtnNormativeBasis } from "./rtn-npa-staff";

const receipt = { run_id: "46ef8942-47ac-4e99-9969-355246a90385", status: "queued", queued_at: "2026-11-15T02:00:00Z" };
beforeEach(() => vi.resetAllMocks());
describe("ordinary-staff normative check boundary", () => {
  it("sends only the selected tenant and bank to the authenticated user endpoint", async () => {
    transport.invoke.mockResolvedValue({ data: { ...receipt, internal_detail: "not a browser result" }, error: null });
    expect(await checkRtnNormativeBasis("tenant-a", "bank-a")).toEqual(receipt);
    expect(transport.invoke).toHaveBeenCalledExactlyOnceWith("rtn-npa-check", { body: { operation: "check", organizationId: "tenant-a", bankId: "bank-a" } });
  });
  it.each([
    { ...receipt, run_id: "another-run" },
    { ...receipt, status: "unchanged" },
    { ...receipt, queued_at: null },
    { ...receipt, queued_at: "not a date" },
  ])("refuses a purported completed proof or malformed queue receipt: %o", async data => {
    transport.invoke.mockResolvedValue({ data, error: null });
    await expect(checkRtnNormativeBasis("tenant-a", "bank-a")).rejects.toThrow("Сервер не подтвердил");
    expect(transport.invoke).toHaveBeenCalledTimes(1);
  });
  it("keeps a lost reply uncertain without retrying or exposing transport details", async () => {
    transport.invoke.mockRejectedValue(new Error("upstream private details"));
    await expect(checkRtnNormativeBasis("tenant-a", "bank-a")).rejects.toThrow("запрос мог уже попасть в очередь");
    expect(transport.invoke).toHaveBeenCalledTimes(1);
  });
});
