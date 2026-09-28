import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getSession: vi.fn(), getUser: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(),
  onAuthStateChange: vi.fn(), rpc: vi.fn(), from: vi.fn(), role: vi.fn(), blocked: vi.fn(), getAuthenticatorAssuranceLevel: vi.fn(), getAuthorizationDetails: vi.fn(),
  approveAuthorization: vi.fn(), denyAuthorization: vi.fn(),
}));
const roleQuery = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), limit: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: api.rpc, from: api.from,
  auth: { ...api, mfa: { getAuthenticatorAssuranceLevel: api.getAuthenticatorAssuranceLevel }, oauth: {
    getAuthorizationDetails: api.getAuthorizationDetails,
    approveAuthorization: api.approveAuthorization,
    denyAuthorization: api.denyAuthorization,
  } },
} }));
import OAuthConsent from "./OAuthConsent";

const requestId = "8c61ee38-b93e-42e0-8f8d-36b65272ece6";
const user = { id: "admin-id", email: "owner@example.test" };
const session = { data: { session: { user } }, error: null };
const callback = "https://chatgpt.com/connector/oauth/example?code=server-code&state=server-state";
const details = () => ({ authorization_id: requestId, client: { id: "client-id", name: "ChatGPT", uri: "https://chatgpt.com", logo_uri: "" }, user, scope: "openid email offline_access" });
const mount = (query = `authorization_id=${requestId}`) => {
  const redirect = vi.fn();
  render(<MemoryRouter initialEntries={[`/.lovable/oauth/consent?${query}`]}><HelmetProvider><OAuthConsent redirect={redirect} /></HelmetProvider></MemoryRouter>);
  return redirect;
};
beforeEach(() => {
  vi.resetAllMocks();
  api.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  api.getSession.mockResolvedValue(session);
  api.getUser.mockResolvedValue({ data: { user }, error: null });
  api.role.mockResolvedValue({ data: [{ role: "admin" }], error: null });
  api.from.mockReturnValue(roleQuery);
  roleQuery.select.mockReturnValue(roleQuery);
  roleQuery.eq.mockReturnValue(roleQuery);
  roleQuery.limit.mockImplementation(() => api.role());
  api.blocked.mockResolvedValue({ data: false, error: null });
  api.rpc.mockImplementation(() => api.blocked());
  api.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
  api.getAuthorizationDetails.mockResolvedValue({ data: details(), error: null });
  api.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
  api.signOut.mockResolvedValue({ error: null });
  api.approveAuthorization.mockResolvedValue({ data: { redirect_url: callback }, error: null });
  api.denyAuthorization.mockResolvedValue({ data: { redirect_url: "https://chatgpt.com/connector/oauth/example?error=access_denied" }, error: null });
});
afterEach(cleanup);

describe("SINTAGMA OAuth consent", () => {
  it.each(["", "authorization_id=bad%2Fpath", "authorization_id=a&authorization_id=b"])("rejects a missing, malformed or ambiguous request: %s", async (query) => {
    mount(query);
    expect(await screen.findByRole("alert")).toHaveTextContent("нет корректного запроса");
    expect(api.getSession).not.toHaveBeenCalled();
    expect(api.getAuthorizationDetails).not.toHaveBeenCalled();
  });

  it("keeps the request through inline login and does not authorize at sign-in", async () => {
    api.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const redirect = mount();
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "OWNER@EXAMPLE.TEST" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));
    await screen.findByRole("button", { name: "Разрешить подключение" });
    expect(api.signInWithPassword).toHaveBeenCalledWith({ email: "owner@example.test", password: "test-password" });
    expect(api.getAuthorizationDetails).toHaveBeenCalledWith(requestId);
    expect(api.approveAuthorization).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("test-password")).not.toBeInTheDocument();
  });

  it("does not read authorization details or grant access to a non-admin", async () => {
    api.role.mockResolvedValue({ data: [], error: null });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("только администратор");
    expect(api.getAuthorizationDetails).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Разрешить подключение" })).not.toBeInTheDocument();
  });

  it("offers login again when the cached session is no longer verified by Auth", async () => {
    api.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } });
    mount();
    await screen.findByLabelText("Пароль");
    expect(screen.getByRole("alert")).toHaveTextContent("Сеанс входа не подтверждён");
    expect(api.rpc).not.toHaveBeenCalled();
    expect(api.from).not.toHaveBeenCalled();
    expect(api.getAuthorizationDetails).not.toHaveBeenCalled();
  });

  it("does not authorize a blocked platform administrator", async () => {
    api.blocked.mockResolvedValue({ data: true, error: null });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("нет подтверждённого доступа");
    expect(api.getAuthorizationDetails).not.toHaveBeenCalled();
    expect(api.approveAuthorization).not.toHaveBeenCalled();
  });

  it("fails closed when the account block status cannot be verified", async () => {
    api.blocked.mockResolvedValue({ data: null, error: { message: "private diagnostic" } });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось проверить");
    expect(api.getAuthorizationDetails).not.toHaveBeenCalled();
    expect(screen.queryByText(/private diagnostic/)).not.toBeInTheDocument();
  });

  it("waits for the existing platform MFA challenge before reading the OAuth request", async () => {
    api.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    mount();
    expect(await screen.findByText(/Завершите двухфакторную проверку/)).toBeInTheDocument();
    expect(api.getAuthorizationDetails).not.toHaveBeenCalled();
    expect(api.approveAuthorization).not.toHaveBeenCalled();
    api.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
    await act(async () => { api.onAuthStateChange.mock.calls[0][0]("MFA_CHALLENGE_VERIFIED", { user }); });
    await screen.findByRole("button", { name: "Разрешить подключение" });
    expect(api.getAuthorizationDetails).toHaveBeenCalledWith(requestId);
    expect(api.approveAuthorization).not.toHaveBeenCalled();
  });

  it("fails closed on a role-check error without disclosing backend errors", async () => {
    api.role.mockResolvedValue({ data: null, error: { message: "private backend detail" } });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось проверить");
    expect(api.getAuthorizationDetails).not.toHaveBeenCalled();
    expect(screen.queryByText(/private backend detail/)).not.toBeInTheDocument();
  });

  it("rejects authorization details for a different account", async () => {
    api.getAuthorizationDetails.mockResolvedValue({ data: { ...details(), user: { id: "someone-else" } }, error: null });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось проверить");
    expect(api.approveAuthorization).not.toHaveBeenCalled();
  });

  it("shows the real client and scopes as text, then redirects only after explicit approval", async () => {
    api.getAuthorizationDetails.mockResolvedValue({ data: { ...details(), client: { ...details().client, name: "<img src=x onerror=alert(1)>" } }, error: null });
    const redirect = mount("authorization_id=" + requestId + "&redirect_url=https%3A%2F%2Fattacker.example");
    const approve = await screen.findByRole("button", { name: "Разрешить подключение" });
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("Сохранение подключения между сеансами")).toBeInTheDocument();
    expect(api.approveAuthorization).not.toHaveBeenCalled();
    fireEvent.click(approve);
    await waitFor(() => expect(redirect).toHaveBeenCalledWith(callback));
    expect(api.approveAuthorization).toHaveBeenCalledWith(requestId, { skipBrowserRedirect: true });
    expect(api.role).toHaveBeenCalledTimes(2);
    expect(api.from).toHaveBeenCalledWith("user_roles");
    expect(roleQuery.select).toHaveBeenCalledWith("role");
    expect(roleQuery.eq).toHaveBeenCalledWith("user_id", user.id);
    expect(roleQuery.eq).toHaveBeenCalledWith("role", "admin");
    expect(roleQuery.limit).toHaveBeenCalledWith(1);
    expect(api.rpc).not.toHaveBeenCalledWith("has_role", expect.anything());
  });

  it("rechecks the admin role before approval and blocks a revoked role", async () => {
    api.role.mockResolvedValueOnce({ data: [{ role: "admin" }], error: null }).mockResolvedValue({ data: [], error: null });
    const redirect = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Разрешить подключение" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("только администратор");
    expect(api.approveAuthorization).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends an explicit denial to Supabase and uses its callback", async () => {
    const redirect = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Отклонить" }));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("https://chatgpt.com/connector/oauth/example?error=access_denied"));
    expect(api.denyAuthorization).toHaveBeenCalledWith(requestId, { skipBrowserRedirect: true });
    expect(api.approveAuthorization).not.toHaveBeenCalled();
  });

  it("does not redirect when approval fails or returns no callback", async () => {
    api.approveAuthorization.mockResolvedValue({ data: null, error: { message: "private diagnostic" } });
    const redirect = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Разрешить подключение" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Подключение не завершено");
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.queryByText(/private diagnostic/)).not.toBeInTheDocument();
  });

  it.each([null, "", "//chatgpt.com/path", "http://chatgpt.com/path", "javascript:alert(1)", "https://user:password@chatgpt.com/path"])("rejects an unsafe server callback: %s", async (redirectUrl) => {
    api.approveAuthorization.mockResolvedValue({ data: { redirect_url: redirectUrl }, error: null });
    const redirect = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Разрешить подключение" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Подключение не завершено");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("handles an already-approved request without automatic navigation or a second grant", async () => {
    api.getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: callback }, error: null });
    const redirect = mount();
    const continueButton = await screen.findByRole("button", { name: "Продолжить в приложении" });
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Отклонить" })).not.toBeInTheDocument();
    expect(api.denyAuthorization).not.toHaveBeenCalled();
    fireEvent.click(continueButton);
    await waitFor(() => expect(redirect).toHaveBeenCalledWith(callback));
    expect(api.approveAuthorization).not.toHaveBeenCalled();
  });

  it("preserves an already-issued callback when SIGNED_IN repeats for the same account", async () => {
    api.getAuthorizationDetails.mockResolvedValueOnce({ data: { redirect_url: callback }, error: null })
      .mockResolvedValue({ data: null, error: { message: "authorization request cannot be processed" } });
    const redirect = mount();
    await screen.findByRole("button", { name: "Продолжить в приложении" });
    await act(async () => { api.onAuthStateChange.mock.calls[0][0]("SIGNED_IN", { user }); });
    expect(api.getAuthorizationDetails).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Продолжить в приложении" }));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith(callback));
  });

  it("invalidates the current consent screen when the signed-in account changes", async () => {
    mount();
    await screen.findByRole("button", { name: "Разрешить подключение" });
    const otherUser = { id: "other-admin", email: "other@example.test" };
    api.getSession.mockResolvedValue({ data: { session: { user: otherUser } }, error: null });
    api.getUser.mockResolvedValue({ data: { user: otherUser }, error: null });
    api.getAuthorizationDetails.mockResolvedValue({ data: null, error: { message: "authorization belongs to different user" } });
    await act(async () => { api.onAuthStateChange.mock.calls[0][0]("SIGNED_IN", { user: otherUser }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось проверить");
    expect(screen.queryByRole("button", { name: "Разрешить подключение" })).not.toBeInTheDocument();
    expect(api.approveAuthorization).not.toHaveBeenCalled();
  });

  it("returns to login on local sign-out while keeping the authorization request", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Войти другой учётной записью" }));
    await screen.findByLabelText("Пароль");
    expect(api.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(api.approveAuthorization).not.toHaveBeenCalled();
  });
});
