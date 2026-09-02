import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/queryWrapper";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useCompaniesManager } from "@/hooks/useCompaniesManager";
import { supabase } from "@/integrations/supabase/client";

describe("useCompaniesManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes with default state", () => {
    const { result } = renderHook(() => useCompaniesManager("org-1"), { wrapper: createQueryWrapper() });

    expect(result.current.companies).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.searchQuery).toBe("");
    expect(result.current.showCreateDialog).toBe(false);
    expect(result.current.showEditDialog).toBe(false);
    expect(result.current.showDeleteConfirm).toBe(false);
    expect(result.current.isCreating).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.newCompanyName).toBe("");
    expect(result.current.newCompanyInn).toBe("");
    expect(result.current.editingCompany).toBeNull();
    expect(result.current.deletingCompany).toBeNull();
  });

  it("initial global doc stats are zero", () => {
    const { result } = renderHook(() => useCompaniesManager("org-1"), { wrapper: createQueryWrapper() });

    expect(result.current.globalDocStats).toEqual({
      contracts: 0,
      invoices: 0,
      paidInvoices: 0,
      unpaidInvoices: 0,
      paidAmount: 0,
      unpaidAmount: 0,
    });
  });

  it("can toggle create dialog", () => {
    const { result } = renderHook(() => useCompaniesManager("org-1"), { wrapper: createQueryWrapper() });

    act(() => { result.current.setShowCreateDialog(true); });
    expect(result.current.showCreateDialog).toBe(true);

    act(() => { result.current.setShowCreateDialog(false); });
    expect(result.current.showCreateDialog).toBe(false);
  });

  it("can update search query and filter", () => {
    const { result } = renderHook(() => useCompaniesManager("org-1"), { wrapper: createQueryWrapper() });

    act(() => { result.current.setSearchQuery("тест"); });
    expect(result.current.searchQuery).toBe("тест");
  });

  it("can update create form fields", () => {
    const { result } = renderHook(() => useCompaniesManager("org-1"), { wrapper: createQueryWrapper() });

    act(() => { result.current.setNewCompanyName("Новая компания"); });
    expect(result.current.newCompanyName).toBe("Новая компания");

    act(() => { result.current.setNewCompanyInn("1234567890"); });
    expect(result.current.newCompanyInn).toBe("1234567890");

    act(() => { result.current.setNewCompanyEmail("test@test.com"); });
    expect(result.current.newCompanyEmail).toBe("test@test.com");
  });

  it("openEditDialog populates edit state", () => {
    const { result } = renderHook(() => useCompaniesManager("org-1"), { wrapper: createQueryWrapper() });
    const company = {
      id: "c-1", name: "Компания", inn: "111", kpp: null, ogrn: null,
      address: null, director: null, email: "test@test.com",
      created_at: "2024-01-01", stamp_url: null, signature_url: null,
    };

    act(() => { result.current.openEditDialog(company); });
    expect(result.current.showEditDialog).toBe(true);
    expect(result.current.editCompanyName).toBe("Компания");
    expect(result.current.editCompanyInn).toBe("111");
    expect(result.current.editCompanyEmail).toBe("test@test.com");
  });

  it("searchDadataEdit populates only edit state", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: true,
        company: {
          name: 'ООО "Найденная компания"',
          fullName: 'Общество с ограниченной ответственностью "Найденная компания"',
          shortName: 'ООО "Найденная компания"',
          inn: "7701234567",
          kpp: "770101001",
          ogrn: "1027700000000",
          address: "г. Москва, ул. Тестовая, д. 1",
          management: "Иванов Иван Иванович",
          status: "ACTIVE",
          type: "LEGAL",
          opf: "ООО",
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useCompaniesManager("org-1"), { wrapper: createQueryWrapper() });
    const company = {
      id: "c-1", name: "Старое название", inn: "1111111111", kpp: "111101001", ogrn: "1011100000000",
      address: "Старый адрес", director: "Старый руководитель", email: "test@test.com",
      created_at: "2024-01-01", stamp_url: null, signature_url: null,
    };

    act(() => {
      result.current.setNewCompanyName("Черновик новой компании");
      result.current.openEditDialog(company);
    });

    await act(async () => {
      await result.current.searchDadataEdit("7701234567");
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith("dadata-company", {
      body: { inn: "7701234567" },
      headers: undefined,
    });
    expect(result.current.editCompanyName).toBe('ООО "Найденная компания"');
    expect(result.current.editCompanyInn).toBe("7701234567");
    expect(result.current.editDocFields).toMatchObject({
      kpp: "770101001",
      ogrn: "1027700000000",
      address: "г. Москва, ул. Тестовая, д. 1",
      director: "Иванов Иван Иванович",
    });
    expect(result.current.dadataEditCompanyInfo?.inn).toBe("7701234567");
    expect(result.current.isSearchingDadataEdit).toBe(false);

    expect(result.current.newCompanyName).toBe("Черновик новой компании");
    expect(result.current.dadataCompanyInfo).toBeNull();
  });

  it("filteredCompanies returns empty when no companies", () => {
    const { result } = renderHook(() => useCompaniesManager("org-1"), { wrapper: createQueryWrapper() });
    expect(result.current.filteredCompanies).toEqual([]);
  });
});
