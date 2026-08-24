import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbState, toastErrorMock, toastSuccessMock, toastWarningMock } = vi.hoisted(() => ({
  dbState: {
    profileRows: [] as Array<Record<string, unknown>>,
    contractRows: [] as Array<Record<string, unknown>>,
    documentRows: [] as Array<Record<string, unknown>>,
    deleteError: null as { message: string } | null,
    storageError: null as { message: string } | null,
    events: [] as string[],
    removedPaths: [] as string[][],
  },
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastWarningMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const rowsFor = (table: string) => {
    if (table === "profiles") return dbState.profileRows;
    if (table === "org_contracts") return dbState.contractRows;
    if (table === "group_documents") return dbState.documentRows;
    return [];
  };

  const from = vi.fn((table: string) => {
    let operation: "select" | "delete" = "select";
    const query: Record<string, any> = {};
    query.select = vi.fn(() => query);
    query.delete = vi.fn(() => {
      operation = "delete";
      dbState.events.push(`db-delete:${table}`);
      return query;
    });
    query.eq = vi.fn(() => query);
    query.is = vi.fn((column: string, value: unknown) => {
      dbState.events.push(`is:${table}:${column}:${String(value)}`);
      return query;
    });
    query.in = vi.fn(() => query);
    query.or = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(
        operation === "delete"
          ? { data: null, error: dbState.deleteError }
          : { data: rowsFor(table), error: null },
      ).then(resolve, reject);
    return query;
  });

  return {
    supabase: {
      from,
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async (paths: string[]) => {
            dbState.events.push("storage-remove");
            dbState.removedPaths.push(paths);
            return { data: null, error: dbState.storageError };
          }),
        })),
      },
    },
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
    warning: toastWarningMock,
  },
}));

import { useGroupContracts } from "@/hooks/useGroupContracts";
import { useGroupDocuments } from "@/hooks/useGroupDocuments";

describe("group document deletion safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.profileRows = [];
    dbState.contractRows = [];
    dbState.documentRows = [];
    dbState.deleteError = null;
    dbState.storageError = null;
    dbState.events = [];
    dbState.removedPaths = [];
  });

  it("не связывает договоры группы с архивными учениками", async () => {
    const { result } = renderHook(() => useGroupContracts("org-1", "group-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(dbState.events).toContain("is:profiles:archived_at:null");
  });

  it("удаляет запись договора до файлов и очищает все уникальные пути", async () => {
    dbState.contractRows = [{
      id: "contract-1",
      organization_id: "org-1",
      student_group_id: "group-1",
      company_id: null,
      file_path: "org/contract.docx",
      docx_path: "org/contract.docx",
      pdf_path: "org/contract.pdf",
    }];
    const { result } = renderHook(() => useGroupContracts("org-1", "group-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    dbState.events = [];

    let removed = false;
    await act(async () => {
      removed = await result.current.remove("contract-1");
    });

    expect(removed).toBe(true);
    expect(dbState.events).toEqual(["db-delete:org_contracts", "storage-remove"]);
    expect(dbState.removedPaths).toEqual([["org/contract.docx", "org/contract.pdf"]]);
    expect(result.current.contracts).toEqual([]);
  });

  it("не удаляет файл договора, если запись БД удалить не удалось", async () => {
    dbState.contractRows = [{
      id: "contract-1",
      organization_id: "org-1",
      student_group_id: "group-1",
      company_id: null,
      file_path: "org/contract.docx",
    }];
    dbState.deleteError = { message: "database unavailable" };
    const { result } = renderHook(() => useGroupContracts("org-1", "group-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    dbState.events = [];

    let removed = true;
    await act(async () => {
      removed = await result.current.remove("contract-1");
    });

    expect(removed).toBe(false);
    expect(dbState.events).toEqual(["db-delete:org_contracts"]);
    expect(dbState.removedPaths).toEqual([]);
    expect(result.current.contracts).toHaveLength(1);
  });

  it("после удаления записи документа очищает его DOCX из Storage", async () => {
    dbState.documentRows = [{
      id: "document-1",
      organization_id: "org-1",
      group_id: "group-1",
      file_path: "org/group/document.docx",
    }];
    const { result } = renderHook(() => useGroupDocuments("org-1", "group-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    dbState.events = [];

    let removed = false;
    await act(async () => {
      removed = await result.current.remove("document-1");
    });

    expect(removed).toBe(true);
    expect(dbState.events).toEqual(["db-delete:group_documents", "storage-remove"]);
    expect(dbState.removedPaths).toEqual([["org/group/document.docx"]]);
    expect(result.current.documents).toEqual([]);
  });

  it("сообщает об orphan-файле, не возвращая удалённую запись в интерфейс", async () => {
    dbState.documentRows = [{
      id: "document-1",
      organization_id: "org-1",
      group_id: "group-1",
      file_path: "org/group/document.docx",
    }];
    dbState.storageError = { message: "storage unavailable" };
    const { result } = renderHook(() => useGroupDocuments("org-1", "group-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      expect(await result.current.remove("document-1")).toBe(true);
    });

    expect(result.current.documents).toEqual([]);
    expect(toastWarningMock).toHaveBeenCalledWith(
      "Документ удалён, но файл не удалось очистить",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });
});
