import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyDetailManager } from "@/hooks/useCompanyDetailManager";
import type { Company } from "@/hooks/useCompaniesManager";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const queryState = vi.hoisted(() => ({
  responses: new Map<string, Promise<{ data: unknown[]; error: null }>>(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, companyId: string) => ({
          order: () => queryState.responses.get(`${table}:${companyId}`),
        }),
      }),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const company = (id: string): Company => ({
  id,
  name: `Company ${id}`,
  inn: null,
  kpp: null,
  ogrn: null,
  address: null,
  director: null,
  email: null,
  created_at: "2026-08-15T00:00:00.000Z",
});

describe("useCompanyDetailManager deep-link races", () => {
  beforeEach(() => {
    queryState.responses.clear();
  });

  it("keeps company B data when slower company A requests resolve last", async () => {
    const aDocuments = deferred<{ data: unknown[]; error: null }>();
    const aStudents = deferred<{ data: unknown[]; error: null }>();
    const bDocuments = deferred<{ data: unknown[]; error: null }>();
    const bStudents = deferred<{ data: unknown[]; error: null }>();
    queryState.responses.set("company_documents:A", aDocuments.promise);
    queryState.responses.set("profiles:A", aStudents.promise);
    queryState.responses.set("company_documents:B", bDocuments.promise);
    queryState.responses.set("profiles:B", bStudents.promise);

    const { result } = renderHook(() => useCompanyDetailManager("org-1"));
    let openA!: Promise<void>;
    let openB!: Promise<void>;

    act(() => {
      openA = result.current.openCompanyDetail(company("A"));
    });
    act(() => {
      openB = result.current.openCompanyDetail(company("B"));
    });

    await act(async () => {
      bDocuments.resolve({
        data: [{ id: "doc-b", company_id: "B", name: "B.pdf" }],
        error: null,
      });
      bStudents.resolve({
        data: [{ id: "profile-b", user_id: "user-b", full_name: "Student B" }],
        error: null,
      });
      await openB;
    });

    expect(result.current.selectedCompanyForDetail?.id).toBe("B");
    expect(result.current.companyDocuments.map((item) => item.id)).toEqual(["doc-b"]);
    expect(result.current.linkStudents.map((item) => item.user_id)).toEqual(["user-b"]);

    await act(async () => {
      aDocuments.resolve({
        data: [{ id: "doc-a", company_id: "A", name: "A.pdf" }],
        error: null,
      });
      aStudents.resolve({
        data: [{ id: "profile-a", user_id: "user-a", full_name: "Student A" }],
        error: null,
      });
      await openA;
    });

    expect(result.current.selectedCompanyForDetail?.id).toBe("B");
    expect(result.current.companyDocuments.map((item) => item.id)).toEqual(["doc-b"]);
    expect(result.current.linkStudents.map((item) => item.user_id)).toEqual(["user-b"]);
    expect(result.current.isLoadingDocuments).toBe(false);
    expect(result.current.isLoadingLinkStudents).toBe(false);
  });
});
