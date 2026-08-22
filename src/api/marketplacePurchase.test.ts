import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MarketplacePurchaseError,
  purchaseMarketplaceCourse,
} from "@/api/marketplacePurchase";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

describe("purchaseMarketplaceCourse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({
      data: { order_id: "order-1", course_id: "course-1", price: 1250 },
      error: null,
    });
  });

  it("sends normalized order data to the atomic server RPC", async () => {
    await expect(purchaseMarketplaceCourse({
      marketplaceCourseId: "  listing-1 ",
      organizationId: " org-1 ",
      studentsCount: 4,
      notes: "  Для отдела  ",
    })).resolves.toEqual({ orderId: "order-1", courseId: "course-1", price: 1250 });

    expect(mocks.rpc).toHaveBeenCalledWith("purchase_marketplace_course", {
      p_marketplace_course_id: "listing-1",
      p_target_organization_id: "org-1",
      p_buyer_type: "organization",
      p_students_count: 4,
      p_notes: "Для отдела",
    });
  });

  it("rejects invalid input before touching the database", async () => {
    await expect(purchaseMarketplaceCourse({
      marketplaceCourseId: "listing-1",
      organizationId: "org-1",
      studentsCount: 0,
    })).rejects.toMatchObject({ code: "invalid_input" });

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps quota and balance failures to safe actionable errors", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "maximum course limit reached" },
    });
    await expect(purchaseMarketplaceCourse({
      marketplaceCourseId: "listing-1",
      organizationId: "org-1",
      studentsCount: 1,
    })).rejects.toMatchObject({ code: "plan_limit" });

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0003", message: "Insufficient organization balance" },
    });
    await expect(purchaseMarketplaceCourse({
      marketplaceCourseId: "listing-1",
      organizationId: "org-1",
      studentsCount: 1,
    })).rejects.toMatchObject({
      code: "insufficient_balance",
      message: "Недостаточно средств на балансе организации",
    });
  });
});
