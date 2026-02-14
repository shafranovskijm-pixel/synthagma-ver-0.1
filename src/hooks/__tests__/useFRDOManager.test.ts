import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        in: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/constants/frdo", () => ({
  detectGenderFromMiddleName: vi.fn().mockReturnValue(""),
  generateDocumentNumber: vi.fn().mockReturnValue("DOC-001"),
  generateRegNumber: vi.fn().mockReturnValue("REG-001"),
  REQUIRED_FIELDS: [],
}));

vi.mock("@/utils/frdoExcelExport", () => ({
  buildDPORow: vi.fn().mockReturnValue([]),
  buildPORow: vi.fn().mockReturnValue([]),
  exportFRDOExcel: vi.fn().mockResolvedValue(undefined),
  formatDateForFRDO: vi.fn().mockReturnValue(""),
}));

import { useFRDOManager } from "@/hooks/useFRDOManager";

describe("useFRDOManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes with default state", () => {
    const { result } = renderHook(() => useFRDOManager("org-1"));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.students).toEqual([]);
    expect(result.current.courses).toEqual([]);
    expect(result.current.searchQuery).toBe("");
    expect(result.current.statusFilter).toBe("all");
    expect(result.current.courseFilter).toBe("all");
    expect(result.current.selectedStudents).toEqual(new Set());
    expect(result.current.isExporting).toBe(false);
    expect(result.current.showExportDialog).toBe(false);
  });

  it("can update search query", () => {
    const { result } = renderHook(() => useFRDOManager("org-1"));
    act(() => { result.current.setSearchQuery("Иванов"); });
    expect(result.current.searchQuery).toBe("Иванов");
  });

  it("can update status filter", () => {
    const { result } = renderHook(() => useFRDOManager("org-1"));
    act(() => { result.current.setStatusFilter("complete"); });
    expect(result.current.statusFilter).toBe("complete");
  });

  it("can update course filter", () => {
    const { result } = renderHook(() => useFRDOManager("org-1"));
    act(() => { result.current.setCourseFilter("course-1"); });
    expect(result.current.courseFilter).toBe("course-1");
  });

  it("can toggle export dialog", () => {
    const { result } = renderHook(() => useFRDOManager("org-1"));
    act(() => { result.current.setShowExportDialog(true); });
    expect(result.current.showExportDialog).toBe(true);
  });

  it("stats show all zeros initially", () => {
    const { result } = renderHook(() => useFRDOManager("org-1"));
    expect(result.current.stats).toEqual({
      total: 0,
      complete: 0,
      incomplete: 0,
      empty: 0,
    });
  });

  it("filteredStudents is empty initially", () => {
    const { result } = renderHook(() => useFRDOManager("org-1"));
    expect(result.current.filteredStudents).toEqual([]);
  });

  it("hasPOCourses is false when no courses", () => {
    const { result } = renderHook(() => useFRDOManager("org-1"));
    expect(result.current.hasPOCourses).toBe(false);
  });

  it("missingFieldsStats is empty initially", () => {
    const { result } = renderHook(() => useFRDOManager("org-1"));
    expect(result.current.missingFieldsStats).toEqual([]);
  });
});
