import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailingSendersTab } from "../MailingSendersTab";

const mocks = vi.hoisted(() => ({ load: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, warning: vi.fn() } }));
vi.mock("@/components/organization/sales/OrgSmtpSettings", () => ({ OrgSmtpSettings: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: (_field: string, org: string) => ({ order: () => mocks.load(org) }) }) }),
  rpc: mocks.rpc, functions: { invoke: mocks.invoke },
} }));

const sender = {
  id: "sender-1", label: "Учебная почта", from_name: "Школа", from_email: "sender@example.org",
  smtp_host: "mail.example.org", smtp_port: 465, smtp_security: "ssl", smtp_username: "sender@example.org",
  imap_host: "mail.example.org", imap_port: 993, imap_security: "ssl", imap_username: null,
  smtp_status: "ok", imap_status: "ok", smtp_error_category: null, imap_error_category: null,
  smtp_latency_ms: 10, imap_latency_ms: 10, preset_key: "custom", daily_limit: 50, is_active: true,
};
let rows: typeof sender[];
beforeEach(() => {
  vi.resetAllMocks();
  rows = [{ ...sender }];
  mocks.load.mockImplementation(async () => ({ data: rows, error: null }));
  mocks.rpc.mockResolvedValue({ data: { id: sender.id }, error: null });
});
afterEach(cleanup);

async function openEditor() {
  await screen.findByText(sender.label);
  fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
}
function next() { fireEvent.click(screen.getByRole("button", { name: "Далее" })); }

describe("sender configuration workflow", () => {
  it("identifies the fixed provider before collecting batch mailbox credentials", async () => {
    render(<MailingSendersTab organizationId="org" />);
    await screen.findByText(sender.label);
    fireEvent.click(screen.getByRole("button", { name: "Пакетное подключение mail.torgi.com.ru" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Только для ящиков с SMTP и IMAP на mail.torgi.com.ru");
    expect(screen.getByRole("dialog")).toHaveTextContent("Почту другого провайдера подключите через «Добавить аккаунт»");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows a load error with retry instead of claiming no senders exist", async () => {
    mocks.load.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    render(<MailingSendersTab organizationId="org" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить отправителей");
    expect(screen.queryByText(/Аккаунтов пока нет/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByText(sender.label)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the full typed email as the automatic SMTP login", async () => {
    render(<MailingSendersTab organizationId="org" />);
    await screen.findByText(sender.label);
    fireEvent.click(screen.getByRole("button", { name: "Добавить аккаунт" }));
    next();
    fireEvent.change(screen.getByLabelText("Название аккаунта"), { target: { value: "Новый ящик" } });
    for (let n = 1; n <= "new@example.org".length; n++) {
      fireEvent.change(screen.getByLabelText("Email отправителя"), { target: { value: "new@example.org".slice(0, n) } });
    }
    next();
    expect(screen.getByLabelText("Логин")).toHaveValue("new@example.org");
  });

  it("edits the selected sender with a null password and no fabricated verification fields", async () => {
    render(<MailingSendersTab organizationId="org" />);
    await openEditor();
    fireEvent.change(screen.getByLabelText("Название аккаунта"), { target: { value: "Новое имя" } });
    next();
    expect(screen.getByLabelText("Новый пароль ящика")).toHaveValue("");
    next(); next();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("save_mailing_sender", {
      p_sender_id: sender.id, p_organization_id: "org", p_password: null,
      p_settings: expect.objectContaining({ label: "Новое имя", smtp_username: sender.smtp_username }),
    }));
    const payload = mocks.rpc.mock.calls[0][1].p_settings;
    expect(payload).not.toHaveProperty("smtp_status");
    expect(payload).not.toHaveProperty("password_encrypted");
    expect(payload).not.toHaveProperty("is_active");
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
  });

  it("does not announce a successful save when the RPC confirms no sender", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    render(<MailingSendersTab organizationId="org" />);
    await openEditor(); next(); next(); next();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });

  it("disables the sender only through the scoped RPC and keeps its row", async () => {
    mocks.rpc.mockImplementation(async () => {
      rows = [{ ...sender, is_active: false }];
      return { data: { id: sender.id, is_active: false }, error: null };
    });
    render(<MailingSendersTab organizationId="org" />);
    fireEvent.click(await screen.findByRole("button", { name: "Отключить" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("set_mailing_sender_active", {
      p_sender_id: sender.id, p_organization_id: "org", p_is_active: false,
    }));
    expect(await screen.findByRole("button", { name: "Включить" })).toBeEnabled();
    expect(screen.getByText(sender.label)).toBeInTheDocument();
  });

  it("retains the active sender when disable is denied", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    render(<MailingSendersTab organizationId="org" />);
    fireEvent.click(await screen.findByRole("button", { name: "Отключить" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Отключить" })).toBeEnabled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("requires new verification before enabling a sender whose credentials changed", async () => {
    rows = [{ ...sender, is_active: false, smtp_status: "untested", imap_status: "untested" }];
    render(<MailingSendersTab organizationId="org" />);
    expect(await screen.findByRole("button", { name: "Включить" })).toBeDisabled();
    expect(screen.getByText(/Для включения ящика нужны/)).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("lets an incomplete IMAP draft be saved while explaining how to complete activation", async () => {
    rows = [{ ...sender, is_active: false, imap_host: "", imap_status: "untested" }];
    render(<MailingSendersTab organizationId="org" />);
    expect(await screen.findByRole("button", { name: "Включить" })).toBeDisabled();
    expect(screen.getByText(/IMAP не настроен/)).toBeInTheDocument();
    await openEditor(); next(); next();
    expect(screen.getByText(/Без IMAP можно сохранить черновик/)).toBeInTheDocument();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText(/Сохранён черновик без IMAP/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Тест IMAP" })).toBeDisabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("stops a batch connection check when the organization changes", async () => {
    let resolve!: (value: unknown) => void;
    rows = [{ ...sender, smtp_status: "untested", imap_status: "untested" }];
    mocks.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { rerender } = render(<MailingSendersTab organizationId="org" />);
    await screen.findByText(sender.label);
    fireEvent.click(screen.getByRole("button", { name: "Проверить все" }));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    rows = [{ ...sender, id: "other-sender", label: "Другая почта" }];
    rerender(<MailingSendersTab organizationId="other-org" />);
    await act(async () => { resolve({ data: { success: true }, error: null }); });
    expect(await screen.findByText("Другая почта")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Проверить все" })).toBeEnabled();
  });

  it("does not report a fabricated activation count when the RPC returns no result", async () => {
    rows = [{ ...sender, is_active: false }];
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    render(<MailingSendersTab organizationId="org" />);
    await screen.findByText(sender.label);
    fireEvent.click(screen.getByRole("button", { name: "Активировать проверенные" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Активировать проверенные" })).toBeEnabled();
  });

  it("discards an old save response and clears the password after switching organizations", async () => {
    let resolve!: (value: unknown) => void;
    mocks.rpc.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { rerender } = render(<MailingSendersTab organizationId="org" />);
    await openEditor(); next();
    fireEvent.change(screen.getByLabelText("Новый пароль ящика"), { target: { value: "synthetic-password" } });
    next(); next();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    rows = [{ ...sender, id: "other-sender", label: "Другая почта" }];
    rerender(<MailingSendersTab organizationId="other-org" />);
    await act(async () => { resolve({ data: { id: sender.id }, error: null }); });
    expect(await screen.findByText("Другая почта")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(within(screen.getByTestId("sender-row")).queryByText(sender.label)).not.toBeInTheDocument();
  });
});
