import { act, cleanup, renderHook } from "@testing-library/react";
import type { MouseEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/types";
import type { LimitCheckResult } from "@/utils/limitToast";
import { useCoursesTab } from "../useCoursesTab";

const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });
});
afterEach(cleanup);

function setup(checkResult: LimitCheckResult) {
  const checkLimit = vi.fn(() => checkResult);
  const refetchLimits = vi.fn();
  const updateCourseLocally = vi.fn();
  const hook = renderHook(() => useCoursesTab({
    organizationId: "org", checkLimit, hasCourseSettings: false, refetchLimits,
    navigate: vi.fn(), setViewMode: vi.fn(),
    courses: { create: vi.fn(), update: vi.fn(), duplicate: vi.fn(), createCat: vi.fn(), updateCat: vi.fn(), removeCat: vi.fn(), refresh: vi.fn(), updateCourseLocally, categories: [], filteredCourses: [] },
  }));
  return { ...hook, checkLimit, refetchLimits, updateCourseLocally };
}
const course = { id: "course", sequential_lessons: false, hidden_from_catalog: false } as Course;
const event = () => ({ stopPropagation: vi.fn() }) as unknown as MouseEvent;

describe("course settings use a verified feature decision", () => {
  it.each(["checking", "verification_error", "plan_feature"] as const)("does not mutate settings for %s and preserves its action", async reason => {
    const { result, checkLimit, refetchLimits, updateCourseLocally } = setup({ allowed: false, reason, message: "Проверка настроек" });
    await act(async () => { await result.current.handleToggleCourseSetting(course, "sequential_lessons", event()); });
    expect(checkLimit).toHaveBeenCalledExactlyOnceWith("course_settings");
    expect(updateCourseLocally).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    const options = mocks.error.mock.calls[0][1];
    if (reason === "checking") expect(options).not.toHaveProperty("action");
    if (reason === "plan_feature") expect(options.action.label).toBe("Перейти на тариф");
    if (reason === "verification_error") {
      options.action.onClick();
      expect(refetchLimits).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.from).not.toHaveBeenCalled();
    }
  });

  it("updates settings only when their current check permits them", async () => {
    const { result, updateCourseLocally } = setup({ allowed: true, message: "" });
    await act(async () => { await result.current.handleToggleCourseSetting(course, "sequential_lessons", event()); });
    expect(updateCourseLocally).toHaveBeenCalledWith("course", { sequential_lessons: true });
    expect(mocks.update).toHaveBeenCalledWith({ sequential_lessons: true });
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("preserves the existing independent catalog-visibility permission", async () => {
    const { result, checkLimit } = setup({ allowed: false, reason: "checking", message: "Проверка" });
    await act(async () => { await result.current.handleToggleCourseSetting(course, "hidden_from_catalog", event()); });
    expect(checkLimit).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ hidden_from_catalog: true });
  });
});
