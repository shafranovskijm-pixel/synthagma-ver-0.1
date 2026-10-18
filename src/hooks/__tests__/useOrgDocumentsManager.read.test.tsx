import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ documents: vi.fn(), organization: vi.fn(), toast: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: state.toast, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const query = { select: () => query, eq: () => query, is: () => query, order: () => state.documents(), single: () => state.organization() };
  if (!["org_documents", "organizations"].includes(table)) throw new Error(`Unexpected query ${table}`);
  return query;
} } }));
import { useOrgDocumentsManager } from "../useOrgDocumentsManager";
beforeEach(() => { state.documents.mockReset().mockResolvedValue({ data: [], error: null }); state.organization.mockReset().mockResolvedValue({ data: { id: "org", name: "Центр" }, error: null }); state.toast.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
it.each([{ data: null, error: { code: "42501" } }, { data: null, error: null }])("does not classify an unavailable file list as successfully empty", async response => {
  state.documents.mockResolvedValueOnce(response);
  const { result } = renderHook(() => useOrgDocumentsManager("org", false));
  await waitFor(() => expect(result.current.isLoading).toBe(false)); expect(result.current.documentsError).toMatch(/наличие пока не подтверждено/);
  await act(async () => { await result.current.refreshDocuments(); }); expect(result.current.documentsError).toBeNull(); expect(result.current.documents).toEqual([]);
});
it("ignores a stale failure after switching organization", async () => {
  let resolve!: (value: any) => void; state.documents.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const { result, rerender } = renderHook(({ id }) => useOrgDocumentsManager(id, false), { initialProps: { id: "org" } });
  rerender({ id: "other" }); await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => resolve({ data: null, error: { message: "old denied request" } }));
  expect(result.current.documentsError).toBeNull(); expect(state.toast).not.toHaveBeenCalled();
});
