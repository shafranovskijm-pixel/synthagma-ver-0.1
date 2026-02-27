import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useContractGenerator } from "@/hooks/useContractGenerator";

const defaultProps = {
  organizationId: "org-1",
  isOpen: true,
  orgRequisites: {
    name: "ООО Тест",
    inn: "1234567890",
    kpp: "123456789",
    ogrn: "1234567890123",
    legal_address: "г. Москва",
    actual_address: "г. Москва",
    director_name: "Иванов И.И.",
    director_position: "Директор",
    bank_name: "Сбербанк",
    bank_bik: "044525225",
    bank_account: "40702810000000000001",
    bank_corr_account: "30101810400000000225",
  },
  preselectedCompany: null,
  onSave: vi.fn(),
  onClose: vi.fn(),
};

describe("useContractGenerator", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes with default state", () => {
    const { result } = renderHook(() => useContractGenerator(defaultProps));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.showPreview).toBe(false);
    expect(result.current.selectedPrograms).toHaveLength(1);
    expect(result.current.selectedPrograms[0].studentsCount).toBe("1");
    expect(result.current.selectedPrograms[0].price).toBe("");
    expect(result.current.additionalTerms).toBe("");
    expect(result.current.companies).toEqual([]);
    expect(result.current.courses).toEqual([]);
  });

  it("formats price correctly", () => {
    const { result } = renderHook(() => useContractGenerator(defaultProps));

    expect(result.current.formatPrice("1000")).toBe("1\u00A0000,00");
    expect(result.current.formatPrice("0")).toBe("0,00");
    expect(result.current.formatPrice("abc")).toBe("0");
    expect(result.current.formatPrice("15500.5")).toBe("15\u00A0500,50");
  });

  it("can add and remove programs", () => {
    const { result } = renderHook(() => useContractGenerator(defaultProps));

    expect(result.current.selectedPrograms).toHaveLength(1);

    act(() => { result.current.addProgram(); });
    expect(result.current.selectedPrograms).toHaveLength(2);

    act(() => { result.current.addProgram(); });
    expect(result.current.selectedPrograms).toHaveLength(3);

    act(() => { result.current.removeProgram(1); });
    expect(result.current.selectedPrograms).toHaveLength(2);

    // Cannot remove last program
    act(() => { result.current.removeProgram(0); });
    act(() => { result.current.removeProgram(0); });
    expect(result.current.selectedPrograms).toHaveLength(1);
  });

  it("can update program fields", () => {
    const { result } = renderHook(() => useContractGenerator(defaultProps));

    act(() => { result.current.updateProgram(0, { courseId: "course-1", price: "5000", studentsCount: "10" }); });
    expect(result.current.selectedPrograms[0].courseId).toBe("course-1");
    expect(result.current.selectedPrograms[0].price).toBe("5000");
    expect(result.current.selectedPrograms[0].studentsCount).toBe("10");
  });

  it("backward compat: setSelectedCourseId updates first program", () => {
    const { result } = renderHook(() => useContractGenerator(defaultProps));

    act(() => { result.current.setSelectedCourseId("course-1"); });
    expect(result.current.selectedCourseId).toBe("course-1");
    expect(result.current.selectedPrograms[0].courseId).toBe("course-1");

    act(() => { result.current.setPrice("5000"); });
    expect(result.current.price).toBe("5000");

    act(() => { result.current.setStudentsCount("10"); });
    expect(result.current.studentsCount).toBe("10");
  });

  it("sets preselected company id when provided", () => {
    const preselectedCompany = { id: "comp-1", name: "Компания", inn: null, kpp: null, ogrn: null, address: null, director: null };
    const { result } = renderHook(() =>
      useContractGenerator({ ...defaultProps, preselectedCompany })
    );

    expect(result.current.selectedCompanyId).toBe("comp-1");
    expect(result.current.selectedCompany).toEqual(preselectedCompany);
  });

  it("contractDate defaults to today", () => {
    const { result } = renderHook(() => useContractGenerator(defaultProps));
    const today = new Date().toISOString().slice(0, 10);
    expect(result.current.contractDate).toBe(today);
  });

  it("can toggle preview", () => {
    const { result } = renderHook(() => useContractGenerator(defaultProps));
    act(() => { result.current.setShowPreview(true); });
    expect(result.current.showPreview).toBe(true);
  });

  it("computes totalPrice from multiple programs", () => {
    const { result } = renderHook(() => useContractGenerator(defaultProps));

    act(() => {
      result.current.updateProgram(0, { courseId: "c1", price: "1000", studentsCount: "2" });
      result.current.addProgram();
    });
    act(() => {
      result.current.updateProgram(1, { courseId: "c2", price: "500", studentsCount: "3" });
    });

    expect(result.current.totalPrice).toBe(1000 * 2 + 500 * 3);
  });
});
