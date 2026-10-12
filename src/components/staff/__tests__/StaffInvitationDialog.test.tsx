import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffInvitationDialog } from "../StaffInvitationDialog";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("sonner", () => ({ toast: mocks }));

const acceptUrl = "https://sintagma.online/accept-invitation?token=test-invitation";
const roles = [{ value: "methodist", label: "Методист" }, { value: "manager", label: "Менеджер" }];
const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  onInvited: vi.fn(),
  roles,
  invitationType: "organization" as const,
  organizationId: "organization-a",
};

function enterEmail(value = "Employee@example.com") {
  fireEvent.change(screen.getByLabelText("Email сотрудника"), { target: { value } });
}

function deferredResult() {
  let resolve!: (result: { data: unknown; error: unknown }) => void;
  const promise = new Promise<{ data: unknown; error: unknown }>(resolver => { resolve = resolver; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.invoke.mockResolvedValue({ data: { success: true, sent: false, accept_url: acceptUrl }, error: null });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(cleanup);

describe("StaffInvitationDialog", () => {
  it("creates an email-bound link without sending mail and shows the chosen recipient and role", async () => {
    render(<StaffInvitationDialog {...baseProps} />);
    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));

    expect(await screen.findByLabelText("Ссылка приглашения")).toHaveValue(acceptUrl);
    expect(mocks.invoke).toHaveBeenCalledWith("send-staff-invitation", {
      body: expect.objectContaining({
        email: "employee@example.com", role: "methodist", organization_id: "organization-a", skip_email: true,
      }),
    });
    expect(screen.getByText("employee@example.com")).toBeInTheDocument();
    expect(screen.getByText("Методист")).toBeInTheDocument();
    expect(screen.getByText(/Письмо не отправлялось/)).toBeInTheDocument();
    expect(mocks.success).toHaveBeenCalledWith("Ссылка приглашения создана");
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(baseProps.onInvited).toHaveBeenCalledTimes(1);
  });

  it("sends email only when explicitly selected", async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true, sent: true, accept_url: acceptUrl }, error: null });
    render(<StaffInvitationDialog {...baseProps} />);
    enterEmail();
    fireEvent.click(screen.getByRole("radio", { name: "Отправить письмо сотруднику" }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить приглашение" }));

    await screen.findByLabelText("Ссылка приглашения");
    expect(mocks.invoke).toHaveBeenCalledWith("send-staff-invitation", {
      body: expect.objectContaining({ skip_email: false }),
    });
    expect(screen.getByText(/Приглашение отправлено по email/)).toBeInTheDocument();
    expect(mocks.success).toHaveBeenCalledWith("Приглашение отправлено на email");
  });

  it("keeps the manual link when email delivery fails without claiming that mail was sent", async () => {
    render(<StaffInvitationDialog {...baseProps} />);
    enterEmail();
    fireEvent.click(screen.getByRole("radio", { name: "Отправить письмо сотруднику" }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить приглашение" }));

    expect(await screen.findByLabelText("Ссылка приглашения")).toHaveValue(acceptUrl);
    expect(screen.getByText(/Приглашение создано, но письмо не отправлено/)).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledTimes(1);
  });

  it("uses form email validation before invoking the server", () => {
    render(<StaffInvitationDialog {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));
    enterEmail("not-an-email");
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));

    expect(screen.getByLabelText("Email сотрудника")).toBeInvalid();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("selects the complete link for manual copying when clipboard access is rejected", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("NotAllowedError"));
    render(<StaffInvitationDialog {...baseProps} />);
    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));
    const link = await screen.findByLabelText<HTMLInputElement>("Ссылка приглашения");
    fireEvent.click(screen.getByRole("button", { name: "Скопировать ссылку" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("скопируйте её вручную");
    expect(link).toHaveFocus();
    expect(link.selectionStart).toBe(0);
    expect(link.selectionEnd).toBe(acceptUrl.length);
    expect(mocks.success).not.toHaveBeenCalledWith("Ссылка скопирована");
  });

  it("ignores a late response after switching organizations, including the old loading completion", async () => {
    const oldRequest = deferredResult();
    const currentRequest = deferredResult();
    mocks.invoke.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(currentRequest.promise);
    const { rerender } = render(<StaffInvitationDialog {...baseProps} />);
    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));
    rerender(<StaffInvitationDialog {...baseProps} organizationId="organization-b" defaultRole="manager" />);
    expect(screen.getByLabelText("Email сотрудника")).toHaveValue("");
    enterEmail("new@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));

    await act(async () => { oldRequest.resolve({ data: { accept_url: acceptUrl, sent: false }, error: null }); });
    expect(screen.queryByLabelText("Ссылка приглашения")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать ссылку" })).toBeDisabled();
    expect(baseProps.onInvited).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();

    const newUrl = acceptUrl.replace("test-invitation", "new-invitation");
    await act(async () => { currentRequest.resolve({ data: { accept_url: newUrl, sent: false }, error: null }); });
    expect(await screen.findByLabelText("Ссылка приглашения")).toHaveValue(newUrl);
    expect(screen.getByText("new@example.com")).toBeInTheDocument();
    expect(screen.getByText("Менеджер")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenLastCalledWith("send-staff-invitation", {
      body: expect.objectContaining({ organization_id: "organization-b", email: "new@example.com", role: "manager" }),
    });
  });

  it("ignores a response after closing and reopening the same organization", async () => {
    const request = deferredResult();
    mocks.invoke.mockReturnValueOnce(request.promise);
    const { rerender } = render(<StaffInvitationDialog {...baseProps} />);
    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(baseProps.onOpenChange).toHaveBeenCalledWith(false);
    rerender(<StaffInvitationDialog {...baseProps} open={false} />);
    rerender(<StaffInvitationDialog {...baseProps} open />);

    await act(async () => { request.resolve({ data: { accept_url: acceptUrl, sent: false }, error: null }); });
    expect(screen.queryByLabelText("Ссылка приглашения")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email сотрудника")).toHaveValue("");
    expect(baseProps.onInvited).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("clears an already-created invitation when the organization changes", async () => {
    const { rerender } = render(<StaffInvitationDialog {...baseProps} />);
    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));
    await screen.findByLabelText("Ссылка приглашения");
    rerender(<StaffInvitationDialog {...baseProps} organizationId="organization-b" />);
    expect(screen.queryByLabelText("Ссылка приглашения")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email сотрудника")).toHaveValue("");
  });

  it("shows the server's permission error from a FunctionsHttpError response", async () => {
    const error = new FunctionsHttpError(new Response(JSON.stringify({ error: "Только руководитель может пригласить сотрудника" }), { status: 403 }));
    mocks.invoke.mockResolvedValue({ data: null, error });
    render(<StaffInvitationDialog {...baseProps} />);
    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Только руководитель может пригласить сотрудника"));
    expect(screen.queryByLabelText("Ссылка приглашения")).not.toBeInTheDocument();
    expect(baseProps.onInvited).not.toHaveBeenCalled();
  });

  it("shows a readable error when the service returns a non-JSON failure", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response("Bad gateway", { status: 503 })) });
    render(<StaffInvitationDialog {...baseProps} />);
    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Сервис приглашений временно недоступен. Попробуйте позже."));
    expect(baseProps.onInvited).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each([undefined, "javascript:alert(1)", "https://sintagma.online/accept-invitation"])("does not claim success without a usable invitation link (%s)", async (url) => {
    mocks.invoke.mockResolvedValue({ data: { success: true, sent: true, accept_url: url }, error: null });
    render(<StaffInvitationDialog {...baseProps} />);
    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Сервер не вернул ссылку")));
    expect(screen.queryByLabelText("Ссылка приглашения")).not.toBeInTheDocument();
    expect(baseProps.onInvited).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
