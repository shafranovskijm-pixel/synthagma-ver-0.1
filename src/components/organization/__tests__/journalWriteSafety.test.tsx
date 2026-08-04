import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

/**
 * Универсальный chainable-мок Supabase: любой await возвращает пустой результат,
 * а вызовы insert/update/delete фиксируются для проверки «ничего не записано».
 */
const insertSpy = vi.fn();
const updateSpy = vi.fn();
const deleteSpy = vi.fn();

function makeChain(): any {
  const result = { data: [], error: null, count: 0 };
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (res: any) => Promise.resolve(result).then(res);
        if (prop === "insert") return (...args: any[]) => { insertSpy(...args); return chain; };
        if (prop === "update") return (...args: any[]) => { updateSpy(...args); return chain; };
        if (prop === "delete") return (...args: any[]) => { deleteSpy(...args); return chain; };
        if (prop === "single" || prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
        return (..._args: any[]) => chain;
      },
    },
  );
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => makeChain()),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "u1" } } })) },
    storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(() => Promise.resolve({ data: null, error: null })) })) },
  },
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...a: any[]) => toastError(...a), info: vi.fn() } }));

import { AutoDocumentRegistrationJournal } from "@/components/organization/AutoDocumentRegistrationJournal";
import { useDocumentRegistrationJournal } from "@/hooks/useDocumentRegistrationJournal";
import { resolveManualWriteGuard, isRowWriteAllowed } from "@/lib/journals/manualWriteGuard";

const groupContext = {
  groupId: "g1",
  courseId: "c1",
  memberUserIds: ["member-1"],
  status: "ready" as const,
};

describe("resolveManualWriteGuard", () => {
  it("blocks manual add in any group context and allows it without context", () => {
    expect(resolveManualWriteGuard("document_registration", groupContext).blocked).toBe(true);
    expect(resolveManualWriteGuard("document_registration", { ...groupContext, status: "loading", memberUserIds: null }).blocked).toBe(true);
    expect(resolveManualWriteGuard("document_registration", null).blocked).toBe(false);
    expect(resolveManualWriteGuard("document_registration", undefined).blocked).toBe(false);
  });

  it("allows row writes only for scoped rows", () => {
    const scoped = [{ id: "r1" }];
    expect(isRowWriteAllowed("r1", scoped, groupContext)).toBe(true);
    expect(isRowWriteAllowed("r2", scoped, groupContext)).toBe(false);
    expect(isRowWriteAllowed(null, scoped, groupContext)).toBe(false);
    // Без контекста группы ограничений нет
    expect(isRowWriteAllowed("r2", scoped, null)).toBe(true);
  });
});

describe("AutoDocumentRegistrationJournal write safety", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("hides unsafe Add button in group context and explains why", async () => {
    render(<AutoDocumentRegistrationJournal organizationId="org1" onClose={() => {}} groupContext={groupContext} />);
    await waitFor(() => expect(screen.getByTestId("manual-add-blocked-notice")).toBeTruthy());
    expect(screen.queryByTestId("add-document-button")).toBeNull();
    // Экспорт остаётся доступным
    expect(screen.getByText(/Экспорт в Excel/)).toBeTruthy();
  });

  it("shows Add button without group context", async () => {
    render(<AutoDocumentRegistrationJournal organizationId="org1" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("add-document-button")).toBeTruthy());
    expect(screen.queryByTestId("manual-add-blocked-notice")).toBeNull();
  });
});

describe("useDocumentRegistrationJournal handlers", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("handleAddDocument writes nothing when called in group context (no exact enrollment)", async () => {
    const { result } = renderHook(() => useDocumentRegistrationJournal("org1", groupContext));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setNewDocument({ ...result.current.newDocument, document_name: "Произвольный документ" }); });
    await act(async () => { await result.current.handleAddDocument(); });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("handleSaveRegNumber writes nothing for a row outside the group scope", async () => {
    const { result } = renderHook(() => useDocumentRegistrationJournal("org1", groupContext));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setEditingRecord({
        id: "foreign-row", original_id: "foreign-row", reg_number: null, document_type: "contract",
        document_name: "Чужой документ", direction: "outgoing", date: new Date().toISOString(),
        related_entity: null, related_entity_type: null, notes: null, source: "issuance_log",
        is_editable: true, file_url: null, user_id: "other-user", course_id: "other-course",
      } as any);
    });
    await act(async () => { await result.current.handleSaveRegNumber(); });
    expect(updateSpy).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("allows manual add without group context", async () => {
    const { result } = renderHook(() => useDocumentRegistrationJournal("org1", null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.manualAddGuard.blocked).toBe(false);
  });
});
