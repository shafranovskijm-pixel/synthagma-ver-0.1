import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPERATOR_REQUISITES } from "@/constants/operatorDetails";

const { maybeSingle } = vi.hoisted(() => ({ maybeSingle: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  },
}));
import { loadCompanyCardOperatorRequisites } from "@/hooks/useCompanyCardOperatorRequisites";

describe("company card bank loading", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails on a database error without falling back to a cached bank", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "Network unavailable" } });
    await expect(loadCompanyCardOperatorRequisites()).rejects.toThrow("Не удалось загрузить актуальные реквизиты");
  });

  it("fails when the saved record does not exist", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(loadCompanyCardOperatorRequisites()).rejects.toThrow("не сохранены");
  });

  it("loads the saved operator bank", async () => {
    maybeSingle.mockResolvedValue({ data: { setting_value: JSON.stringify(DEFAULT_OPERATOR_REQUISITES) }, error: null });
    await expect(loadCompanyCardOperatorRequisites()).resolves.toEqual(DEFAULT_OPERATOR_REQUISITES);
  });
});
