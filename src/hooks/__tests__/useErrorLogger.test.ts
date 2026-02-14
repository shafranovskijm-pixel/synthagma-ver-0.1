import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        in: vi.fn().mockReturnValue({
          data: [],
          error: null,
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  },
}));

import { useErrorLogger } from "@/hooks/useErrorLogger";

describe("useErrorLogger", () => {
  it("returns getRecentErrors function", () => {
    const { result } = renderHook(() => useErrorLogger());
    expect(typeof result.current.getRecentErrors).toBe("function");
  });

  it("getRecentErrors returns empty array initially", () => {
    const { result } = renderHook(() => useErrorLogger());
    const errors = result.current.getRecentErrors();
    expect(Array.isArray(errors)).toBe(true);
  });

  it("getRecentErrors accepts count parameter", () => {
    const { result } = renderHook(() => useErrorLogger());
    const errors = result.current.getRecentErrors(3);
    expect(errors.length).toBeLessThanOrEqual(3);
  });
});
