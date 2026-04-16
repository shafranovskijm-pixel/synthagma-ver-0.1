import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAiGenerationLimit, setAiLimitContext } from "../useAiGenerationLimit";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("checkAiGenerationLimit", () => {
  it("allows non-free plans", async () => {
    expect(await checkAiGenerationLimit("org-1", "start")).toBe(true);
    expect(await checkAiGenerationLimit("org-1", "professional")).toBe(true);
  });

  it("allows when no org id", async () => {
    expect(await checkAiGenerationLimit(null, "free")).toBe(true);
  });

  it("allows free plan when under limit", async () => {
    expect(await checkAiGenerationLimit("org-1", "free")).toBe(true);
  });
});

describe("setAiLimitContext", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores org id and plan in session storage", () => {
    setAiLimitContext("org-123", "start");
    expect(sessionStorage.getItem("ai_limit_org_id")).toBe("org-123");
    expect(sessionStorage.getItem("ai_limit_plan")).toBe("start");
  });

  it("handles null org id", () => {
    setAiLimitContext(null, "free");
    expect(sessionStorage.getItem("ai_limit_plan")).toBe("free");
  });
});
