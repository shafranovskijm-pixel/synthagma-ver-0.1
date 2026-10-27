import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  persist: vi.fn(),
  validateSingle: vi.fn(),
  validateBulk: vi.fn(),
  safeInvoke: vi.fn(),
  analysisCourses: [] as string[],
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mock.safeInvoke }));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("@/components/course-builder/block-editor", () => ({
  markdownToBlocks: vi.fn(), blocksToJson: vi.fn(),
}));
vi.mock("../validationHelpers", () => ({
  checkCriticalError: () => false,
  validateCourseIssues: mock.validateSingle,
  validateCourseIssuesSimple: mock.validateBulk,
  generateContentForLesson: vi.fn(),
  generateQuestionsForTest: vi.fn(),
}));

import { useMarketplaceValidation } from "../useMarketplaceValidation";

const row = (number: number) => ({
  id: `listing-${number}`, course_id: `course-${number}`,
  course: { title: `Synthetic course ${number}` }, is_validated: false,
});
const rows = Array.from({ length: 6 }, (_, index) => row(index + 1));
const rules = { minLessons: 3, minContentLength: 50, requireText: true, requireTest: true, checkDuplicateTitles: true };

function savedResponse(id: string, payload: { is_validated: boolean }) {
  return { data: { id, is_validated: payload.is_validated }, error: null };
}

function mount(courses = rows) {
  const fetchData = vi.fn();
  const hook = renderHook(() => useMarketplaceValidation({
    courses, dbCategories: [], fetchData, aiProvider: "synthetic",
    aiPrompts: {}, valRules: rules,
  }));
  return { ...hook, fetchData };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.analysisCourses.length = 0;
  mock.persist.mockReset().mockImplementation(async (id: string, payload: { is_validated: boolean }) => savedResponse(id, payload));
  mock.validateSingle.mockReset().mockResolvedValue([]);
  mock.validateBulk.mockReset().mockResolvedValue([]);
  mock.safeInvoke.mockReset().mockRejectedValue(new Error("Unexpected generation request"));
  mock.toast.loading.mockReturnValue("synthetic-analysis");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock.from.mockImplementation((table: string) => {
    if (table === "marketplace_courses") return {
      update: (payload: { is_validated: boolean }) => ({
        eq: (column: string, id: string) => {
          expect(column).toBe("id");
          return {
            select: (columns: string) => {
              expect(columns).toBe("id,is_validated");
              return { maybeSingle: () => mock.persist(id, payload) };
            },
          };
        },
      }),
    };
    // Preserve the existing structural auto-fix entry without running generation,
    // timers, writes or the large content-repair workflow in this focused suite.
    if (table === "courses") {
      const query = {
        eq: (_column: string, id: string) => { mock.analysisCourses.push(id); return query; },
        single: async () => ({ data: null, error: null }),
      };
      return { select: () => query };
    }
    if (table === "lessons") {
      const query = {
        eq: () => query,
        order: async () => { throw new Error("Synthetic analysis unavailable"); },
      };
      return { select: () => query };
    }
    throw new Error(`Unexpected table access: ${table}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("marketplace structural validation persists before reporting success", () => {
  it("reports a single structural pass only after the listing flag is saved", async () => {
    const { result, fetchData } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(mock.validateSingle).toHaveBeenCalledWith(rows[0].course_id, rules);
    expect(mock.persist).toHaveBeenCalledExactlyOnceWith(rows[0].id, { is_validated: true });
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("ok");
    expect(mock.toast.success).toHaveBeenCalledExactlyOnceWith("Структурная проверка пройдена");
    expect(mock.toast.error).not.toHaveBeenCalled();
    expect(fetchData).toHaveBeenCalledOnce();
    expect(result.current.validatingId).toBeNull();
  });

  it("does not expose a pass or success toast while a save is still pending", async () => {
    let resolveSave!: (value: ReturnType<typeof savedResponse>) => void;
    mock.persist.mockImplementationOnce(() => new Promise<ReturnType<typeof savedResponse>>(resolve => { resolveSave = resolve; }));
    const { result } = mount();
    let validation!: Promise<void>;
    act(() => { validation = result.current.handleValidateCourse(rows[0].course_id); });
    await waitFor(() => expect(mock.persist).toHaveBeenCalledOnce());
    expect(result.current.validatedCourses[rows[0].course_id]).not.toBe("ok");
    expect(result.current.validatingId).toBe(rows[0].course_id);
    expect(mock.toast.success).not.toHaveBeenCalled();
    await act(async () => { resolveSave(savedResponse(rows[0].id, { is_validated: true })); await validation; });
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("ok");
    expect(result.current.validatingId).toBeNull();
  });

  it.each(["returned", "thrown"] as const)("rejects a single %s save error without success or content repair", async (mode) => {
    const failure = new Error("synthetic private persistence detail");
    if (mode === "returned") mock.persist.mockResolvedValueOnce({ error: failure });
    else mock.persist.mockRejectedValueOnce(failure);
    const { result, fetchData } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("error");
    expect(result.current.validatingId).toBeNull();
    expect(mock.toast.success).not.toHaveBeenCalled();
    expect(mock.toast.error).toHaveBeenCalledExactlyOnceWith("Не удалось завершить структурную проверку");
    expect(fetchData).not.toHaveBeenCalled();
    expect(mock.analysisCourses).toEqual([]);
    expect(mock.safeInvoke).not.toHaveBeenCalled();
  });

  it("does not write a flag when the structural check itself throws", async () => {
    mock.validateSingle.mockRejectedValueOnce(new Error("synthetic check unavailable"));
    const { result } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(mock.persist).not.toHaveBeenCalled();
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("error");
    expect(mock.toast.success).not.toHaveBeenCalled();
    expect(mock.toast.error).toHaveBeenCalledOnce();
    expect(mock.analysisCourses).toEqual([]);
  });

  it("does not claim a saved validation for a course without its listing", async () => {
    const { result, fetchData } = mount();
    await act(async () => { await result.current.handleValidateCourse("missing-course"); });
    expect(mock.persist).not.toHaveBeenCalled();
    expect(mock.toast.success).not.toHaveBeenCalled();
    expect(fetchData).not.toHaveBeenCalled();
    expect(result.current.validatedCourses["missing-course"]).toBe("error");
  });

  it("retains the saved structural-failure path and does not call it a pass", async () => {
    mock.validateSingle.mockResolvedValueOnce(["Нет тестов"]);
    const { result, fetchData } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    await waitFor(() => expect(mock.toast.warning).toHaveBeenCalled());
    expect(mock.persist).toHaveBeenCalledExactlyOnceWith(rows[0].id, { is_validated: false });
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("error");
    expect(mock.toast.success).not.toHaveBeenCalled();
    expect(mock.toast.info).toHaveBeenCalledWith(expect.stringContaining("Нет тестов"), expect.any(Object));
    expect(mock.analysisCourses).toEqual([rows[0].course_id]);
    expect(fetchData).toHaveBeenCalledOnce();
    expect(mock.safeInvoke).not.toHaveBeenCalled();
  });

  it("allows a later explicit retry after a failed save to report its real success", async () => {
    mock.persist.mockResolvedValueOnce({ error: new Error("synthetic refused save") }).mockResolvedValueOnce(savedResponse(rows[0].id, { is_validated: true }));
    const { result, fetchData } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("error");
    expect(mock.toast.success).not.toHaveBeenCalled();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(mock.persist).toHaveBeenCalledTimes(2);
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("ok");
    expect(mock.toast.success).toHaveBeenCalledExactlyOnceWith("Структурная проверка пройдена");
    expect(fetchData).toHaveBeenCalledOnce();
  });

  it("counts a fully saved bulk pass and labels only its structural result", async () => {
    const { result } = mount();
    await act(async () => { await result.current.handleBulkValidate({ category: "synthetic", courses: rows.slice(0, 2) }); });
    expect(mock.persist.mock.calls).toEqual(rows.slice(0, 2).map(item => [item.id, { is_validated: true }]));
    expect(result.current.validationReportOk).toBe(2);
    expect(result.current.validationReport).toBeNull();
    expect(result.current.bulkValidatingGroup).toBeNull();
    expect(result.current.bulkValidateProgress).toBe("");
    expect(mock.toast.success).toHaveBeenCalledExactlyOnceWith("Структурная проверка пройдена для 2 из 2 курсов");
    expect(mock.analysisCourses).toEqual([]);
  });

  it("counts returned and thrown bulk save failures separately from the saved pass", async () => {
    mock.persist.mockImplementation(async (id: string, payload: { is_validated: boolean }) => {
      if (id === rows[1].id) return { error: new Error("synthetic returned failure") };
      if (id === rows[2].id) throw new Error("synthetic thrown failure");
      return savedResponse(id, payload);
    });
    const { result } = mount();
    await act(async () => { await result.current.handleBulkValidate({ category: "synthetic", courses: rows.slice(0, 3) }); });
    expect(result.current.validationReportOk).toBe(1);
    expect(result.current.validationReport).toEqual(rows.slice(1, 3).map(item => ({
      courseId: item.course_id, title: item.course.title, issues: ["Ошибка проверки"],
    })));
    expect(result.current.validatedCourses).toMatchObject({ "course-1": "ok", "course-2": "error", "course-3": "error" });
    expect(mock.toast.success).not.toHaveBeenCalled();
    expect(mock.toast.info).toHaveBeenCalledExactlyOnceWith("Структурная проверка: пройдено 1 из 3, не пройдено 2.");
    expect(mock.analysisCourses).toEqual([]);
    expect(mock.safeInvoke).not.toHaveBeenCalled();
    expect(result.current.bulkFixing).toBe(false);
  });

  it("keeps a bulk checker rejection out of both saved passes and content repair", async () => {
    mock.validateBulk.mockImplementation(async (id: string) => {
      if (id === rows[0].course_id) throw new Error("synthetic unavailable lessons");
      return [];
    });
    const { result } = mount();
    await act(async () => { await result.current.handleBulkValidate({ category: "synthetic", courses: rows.slice(0, 2) }); });
    expect(mock.persist).toHaveBeenCalledExactlyOnceWith(rows[1].id, { is_validated: true });
    expect(result.current.validationReportOk).toBe(1);
    expect(result.current.validationReport?.map(item => item.courseId)).toEqual([rows[0].course_id]);
    expect(mock.analysisCourses).toEqual([]);
    expect(mock.toast.success).not.toHaveBeenCalled();
  });

  it("auto-fixes only saved structural issues in a mixed bulk result", async () => {
    mock.validateBulk.mockImplementation(async (id: string) => id === rows[0].course_id ? ["Нет тестов"] : []);
    mock.persist.mockImplementation(async (id: string, payload: { is_validated: boolean }) => id === rows[1].id ? { error: new Error("synthetic refused write") } : savedResponse(id, payload));
    const { result } = mount();
    await act(async () => { await result.current.handleBulkValidate({ category: "synthetic", courses: rows.slice(0, 3) }); });
    await waitFor(() => expect(result.current.bulkFixing).toBe(false));
    expect(mock.persist.mock.calls).toEqual([
      [rows[0].id, { is_validated: false }],
      [rows[1].id, { is_validated: true }],
      [rows[2].id, { is_validated: true }],
    ]);
    expect(result.current.validationReportOk).toBe(1);
    expect(result.current.validationReport).toEqual([
      { courseId: rows[0].course_id, title: rows[0].course.title, issues: ["Нет тестов"] },
      { courseId: rows[1].course_id, title: rows[1].course.title, issues: ["Ошибка проверки"] },
    ]);
    expect(mock.analysisCourses).toEqual([rows[0].course_id]);
    expect(mock.toast.info).toHaveBeenCalledWith("Структурная проверка: пройдено 1 из 3, не пройдено 2. Запускаю исправление замечаний...");
    expect(mock.safeInvoke).not.toHaveBeenCalled();
  });

  it("preserves accurate saved-pass counts across the five-course chunk boundary", async () => {
    mock.persist.mockImplementation(async (id: string, payload: { is_validated: boolean }) => id === rows[1].id ? { error: new Error("synthetic refused first-chunk write") } : savedResponse(id, payload));
    const { result } = mount();
    await act(async () => { await result.current.handleBulkValidate({ category: "synthetic", courses: rows }); });
    expect(mock.persist).toHaveBeenCalledTimes(6);
    expect(result.current.validationReportOk).toBe(5);
    expect(result.current.validationReport).toEqual([{ courseId: rows[1].course_id, title: rows[1].course.title, issues: ["Ошибка проверки"] }]);
    expect(result.current.validatedCourses[rows[5].course_id]).toBe("ok");
    expect(result.current.bulkValidatingGroup).toBeNull();
    expect(result.current.bulkValidateProgress).toBe("");
    expect(mock.toast.info).toHaveBeenCalledExactlyOnceWith("Структурная проверка: пройдено 5 из 6, не пройдено 1.");
    expect(mock.toast.success).not.toHaveBeenCalled();
    expect(mock.analysisCourses).toEqual([]);
  });
});


describe("marketplace validation requires the exact mutation-returned row", () => {
  it.each(["missing row", "wrong id", "wrong flag"] as const)("rejects a single error-free response with %s", async (mode) => {
    if (mode === "wrong flag") mock.validateSingle.mockResolvedValueOnce(["Нет тестов"]);
    mock.persist.mockImplementationOnce(async (id: string, payload: { is_validated: boolean }) => ({
      data: mode === "missing row" ? null : {
        id: mode === "wrong id" ? "another-listing" : id,
        is_validated: mode === "wrong flag" ? !payload.is_validated : payload.is_validated,
      },
      error: null,
    }));
    const { result, fetchData } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(mock.persist).toHaveBeenCalledExactlyOnceWith(rows[0].id, { is_validated: mode !== "wrong flag" });
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("error");
    expect(result.current.validatingId).toBeNull();
    expect(mock.toast.error).toHaveBeenCalledExactlyOnceWith("Не удалось завершить структурную проверку");
    expect(mock.toast.success).not.toHaveBeenCalled();
    expect(mock.toast.info).not.toHaveBeenCalled();
    expect(fetchData).not.toHaveBeenCalled();
    expect(mock.analysisCourses).toEqual([]);
    expect(mock.safeInvoke).not.toHaveBeenCalled();
  });

  it.each(["missing row", "wrong id", "wrong flag"] as const)("excludes a bulk error-free response with %s from pass counts and repair", async (mode) => {
    if (mode === "wrong flag") mock.validateBulk.mockImplementation(async (id: string) => id === rows[1].course_id ? ["Нет тестов"] : []);
    mock.persist.mockImplementation(async (id: string, payload: { is_validated: boolean }) => {
      if (id !== rows[1].id) return savedResponse(id, payload);
      return {
        data: mode === "missing row" ? null : {
          id: mode === "wrong id" ? "another-listing" : id,
          is_validated: mode === "wrong flag" ? !payload.is_validated : payload.is_validated,
        },
        error: null,
      };
    });
    const { result } = mount();
    await act(async () => { await result.current.handleBulkValidate({ category: "synthetic", courses: rows.slice(0, 2) }); });
    expect(mock.persist.mock.calls).toEqual([
      [rows[0].id, { is_validated: true }],
      [rows[1].id, { is_validated: mode !== "wrong flag" }],
    ]);
    expect(result.current.validationReportOk).toBe(1);
    expect(result.current.validationReport).toEqual([
      { courseId: rows[1].course_id, title: rows[1].course.title, issues: ["Ошибка проверки"] },
    ]);
    expect(result.current.validatedCourses).toMatchObject({ "course-1": "ok", "course-2": "error" });
    expect(result.current.bulkValidatingGroup).toBeNull();
    expect(result.current.bulkFixing).toBe(false);
    expect(mock.toast.success).not.toHaveBeenCalled();
    expect(mock.toast.info).toHaveBeenCalledExactlyOnceWith("Структурная проверка: пройдено 1 из 2, не пройдено 1.");
    expect(mock.analysisCourses).toEqual([]);
    expect(mock.safeInvoke).not.toHaveBeenCalled();
  });
});
