import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  pendingProtocolClient,
  pendingProtocolReadClient,
  type PendingProtocolClient,
  type PendingProtocolReadClient,
} from "./pendingLaborSafetyProtocolContract";

describe("pending protocol API boundary", () => {
  it("reuses the existing client instead of creating another session", () => {
    const existing = { from: vi.fn(), rpc: vi.fn() };
    expect(pendingProtocolClient(existing)).toBe(existing);
    expect(pendingProtocolReadClient(existing)).toBe(existing);
    expect(existing.from).not.toHaveBeenCalled();
    expect(existing.rpc).not.toHaveBeenCalled();
  });

  it("restricts the type boundary to the one pending table and RPC", () => {
    expectTypeOf<Parameters<PendingProtocolReadClient["from"]>[0]>()
      .toEqualTypeOf<"labor_safety_enrollment_protocols">();
    expectTypeOf<Parameters<PendingProtocolClient["rpc"]>[0]>()
      .toEqualTypeOf<"save_labor_safety_enrollment_protocol">();
    expectTypeOf<Parameters<PendingProtocolClient["rpc"]>[1]>().toEqualTypeOf<{
      p_organization_id: string;
      p_enrollment_id: string;
      p_protocol_number: string;
      p_knowledge_check_date: string;
      p_is_passed: boolean;
      p_expected_version: number | null;
    }>();
    expectTypeOf<Awaited<ReturnType<PendingProtocolClient["rpc"]>>["data"]>()
      .toEqualTypeOf<unknown>();
  });
});
