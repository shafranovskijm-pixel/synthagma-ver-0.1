import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DocumentPreview } from "../DocumentPreview";
import { ProtocolTemplateEditor } from "../ProtocolTemplateEditor";
import { HighlightedTemplateEditor } from "../HighlightedTemplateEditor";

const writes = vi.hoisted(() => ({ update: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => writes.from(...args) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  writes.update.mockReset(); writes.from.mockReset();
  writes.update.mockImplementation(() => { throw Error("Editing or preview must not save settings"); });
  writes.from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { branding: {
      protocolTemplate: "Сохранённый текст {{chairman_name}}\n{{commission_members}}",
      commissionMembers: [{ name: "Исходный председатель", position: "Методист", role: "chairman" }],
    } }, error: null }) }) }),
    update: writes.update,
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("actual protocol editor preview (synthetic, no writes)", () => {
  it("updates from edited template and commission without a save or an automatic mutation", async () => {
    render(<ProtocolTemplateEditor organizationId="11111111-1111-4111-8111-111111111111" />);
    const editor = await screen.findByRole("textbox", { name: "Текст шаблона протокола" });
    expect((editor as HTMLTextAreaElement).value).toContain("Сохранённый текст");
    fireEvent.click(screen.getByRole("button", { name: "Предпросмотр протокола" }));
    expect(screen.getByLabelText("Предпросмотр текста протокола").textContent).toContain("Исходный председатель");
    fireEvent.change(editor, { target: { value: "Новый текст {{chairman_name}}\n{{commission_members}}" } });
    fireEvent.change(screen.getByPlaceholderText("ФИО"), { target: { value: "Новый председатель" } });
    const preview = screen.getByLabelText("Предпросмотр текста протокола");
    expect(preview.textContent).toContain("Новый текст Новый председатель");
    expect(preview.textContent).not.toContain("Сохранённый текст");
    expect(preview.textContent).not.toContain("Исходный председатель");
    expect(screen.getByText("Пример на учебных данных. Не является оформленным протоколом.")).toBeTruthy();
    expect(writes.from).toHaveBeenCalledTimes(1);
    expect(writes.update).not.toHaveBeenCalled();
  });

  it("renders template and commission markup as escaped text and responds to prop changes", () => {
    const hostile = '<img src=x onerror="window.__protocolExecuted=1"><script>window.__protocolExecuted=1</script>';
    const view = render(<DocumentPreview type="protocol" protocolTemplate={"Начало " + hostile + " {{chairman_name}}"}
      data={{ commissionMembers: [{ name: hostile, position: "", role: "chairman" }] }} />);
    const preview = screen.getByLabelText("Предпросмотр текста протокола");
    expect(preview.textContent).toContain(hostile);
    expect(preview.querySelector("img,script")).toBeNull();
    expect((window as any).__protocolExecuted).toBeUndefined();
    view.rerender(<DocumentPreview type="protocol" protocolTemplate="Другая редакция {{commission_members}}" data={{ commissionMembers: [] }} />);
    expect(preview.textContent).toBe("Другая редакция Состав комиссии не заполнен");
    expect(preview.querySelector("img,script")).toBeNull();
  });

  it("offers protocol variables in the real context menu instead of contract-only fields", () => {
    const change = vi.fn();
    render(<HighlightedTemplateEditor value="Текст" onChange={change} templateKind="protocol" />);
    expect(screen.queryByTitle("Номер договора")).toBeNull();
    expect(screen.getByTitle("Номер протокола")).toBeTruthy();
    fireEvent.contextMenu(screen.getByRole("textbox", { name: "Текст шаблона протокола" }), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("button", { name: "📌 Протокол" }));
    fireEvent.click(screen.getByRole("button", { name: /Номер протокола/ }));
    expect(change).toHaveBeenCalledWith("{{protocol_number}}Текст");
    expect(writes.update).not.toHaveBeenCalled();
  });
});
