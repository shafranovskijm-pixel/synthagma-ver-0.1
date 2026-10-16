import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAiGenerationLimit, setAiLimitContext } from "../useAiGenerationLimit";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), usage: vi.fn() }));

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: mocks.usage,
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: { organization_id: "org-1", active: false, billing_mode: "prepaid", limits: null, features: { crm: false, webinar: false, videoserviceplus: false, frdoplus: false } }, error: null });
  mocks.usage.mockResolvedValue({ data: null, error: null });
});

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

  it("does not impose the free AI cap on a server-confirmed postpaid agreement", async () => {
    mocks.rpc.mockResolvedValue({ data: { organization_id: "org-1", active: true, billing_mode: "postpaid", limits: { maxCourses: -1, maxStudents: -1, maxTrainedStudents: -1 }, features: { crm: false, webinar: false, videoserviceplus: false, frdoplus: false } }, error: null });
    mocks.usage.mockResolvedValue({ data: { ai_generations_count: 99 }, error: null });
    expect(await checkAiGenerationLimit("org-1", "free")).toBe(true);
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("keeps the legacy free cap without a postpaid agreement", async () => {
    mocks.usage.mockResolvedValue({ data: { ai_generations_count: 3 }, error: null });
    expect(await checkAiGenerationLimit("org-1", "free")).toBe(false);
  });

  it("does not grant access when the postpaid status is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
    expect(await checkAiGenerationLimit("org-1", "free")).toBe(false);
    expect(mocks.usage).not.toHaveBeenCalled();
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
    setAiLimitContext("org-1", "free");
    setAiLimitContext(null, "free");
    expect(sessionStorage.getItem("ai_limit_plan")).toBe("free");
    expect(sessionStorage.getItem("ai_limit_org_id")).toBeNull();
  });
});
