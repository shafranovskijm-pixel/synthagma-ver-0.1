// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AccountSettings from "../AccountSettings";

const state = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111", email: "synthetic@example.invalid" },
  pending: null as unknown,
  ensure: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user, userRole: "admin" }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("@/api/selfProfile", () => ({ ensureOwnProfile: (...args: unknown[]) => state.ensure(...args) }));
vi.mock("@/components/account/pendingDeletion", () => ({ loadPendingDeletion: () => state.pending }));
vi.mock("@/components/account/clearDeletedAccountSession", () => ({ clearDeletedAccountSession: vi.fn() }));
vi.mock("@/components/account/AccountDeletionPanel", () => ({ AccountDeletionPanel: ({ accountId }: { accountId: string }) => <div data-testid="deletion-panel">{accountId}</div> }));
vi.mock("@/components/account/PendingAccountDeletionLink", () => ({ PendingAccountDeletionLink: () => <div data-testid="pending-deletion">Pending</div> }));
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
function deferred() {
  let resolve!: (value: { userId: string; created: boolean }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ userId: string; created: boolean }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const page = () => <StrictMode><MemoryRouter><AccountSettings /></MemoryRouter></StrictMode>;
beforeEach(() => { state.user = { id: a, email: "synthetic@example.invalid" }; state.pending = null; state.ensure.mockReset(); });
afterEach(cleanup);
it("SPA01 StrictMode effect replay shares one in-scope init before deletion preview", async () => {
  const result = deferred(); state.ensure.mockReturnValue(result.promise);
  render(page());
  expect(state.ensure).toHaveBeenCalledTimes(1);
  expect(state.ensure).toHaveBeenCalledWith(a);
  expect(screen.queryByTestId("deletion-panel")).toBeNull();
  await act(async () => result.resolve({ userId: a, created: true }));
  await waitFor(() => expect(screen.getByTestId("deletion-panel").textContent).toBe(a));
});
it("SPA02 Failure shows no success but retains ordinary deletion controls", async () => {
  const result = deferred(); state.ensure.mockReturnValue(result.promise);
  render(page());
  await act(async () => result.reject(new Error("synthetic denial")));
  expect(screen.getByRole("alert").textContent).toContain("Не удалось проверить профиль");
  expect(screen.getByTestId("deletion-panel").textContent).toBe(a);
});
it("SPA03 A known pending deletion never starts profile initialization", () => {
  state.pending = { requestId: "synthetic-pending" };
  render(page());
  expect(state.ensure).not.toHaveBeenCalled();
  expect(screen.getByTestId("pending-deletion")).toBeTruthy();
  expect(screen.queryByTestId("deletion-panel")).toBeNull();
});
it("SPA04 A→B→A never reuses or acknowledges the old scope operation", async () => {
  const oldA = deferred(); const otherB = deferred(); const newA = deferred();
  state.ensure.mockReturnValueOnce(oldA.promise).mockReturnValueOnce(otherB.promise).mockReturnValueOnce(newA.promise);
  const view = render(page());
  state.user = { id: b, email: "synthetic-b@example.invalid" }; view.rerender(page());
  state.user = { id: a, email: "synthetic@example.invalid" }; view.rerender(page());
  expect(state.ensure.mock.calls.map(call => call[0])).toEqual([a, b, a]);
  await act(async () => oldA.resolve({ userId: a, created: true }));
  expect(screen.queryByTestId("deletion-panel")).toBeNull();
  await act(async () => otherB.reject(new Error("late old context")));
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => newA.resolve({ userId: a, created: false }));
  expect(screen.getByTestId("deletion-panel").textContent).toBe(a);
});
