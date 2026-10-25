import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ auth: { user: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }, userRole: "admin" }, data: {} as any }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mock.auth }));
vi.mock("@/hooks/usePublicationCalendar", () => ({ usePublicationCalendar: () => mock.data }));
import { PublicationCalendarPanel } from "@/components/organization/compliance/PublicationCalendarPanel";
import { COMPLIANCE_CATALOG_VERSION } from "@/lib/uc-compliance/catalog";
import { actor, org, record, rule } from './fixtures.ts';
const props = () => ({ organizationId: org, profileRevision: 2, decisions: [{ requirement_id: "self_examination_report", revision: 3, decision: "applicable", profile_revision: 2, catalog_version: COMPLIANCE_CATALOG_VERSION }] as any, documents: [], canRead: true, canWrite: true, canSign: true });
beforeEach(() => { mock.auth = { user: { id: actor }, userRole: "admin" }; mock.data = { key: "first", data: { rules: [rule()], records: [{ streamId: "stream", record: record() }], tasks: [], hasMoreRecords: false, hasMoreTasks: false }, loading: false, saving: false, denied: false, error: null, uncertain: false, mutate: vi.fn(async () => true), reload: vi.fn(), retry: vi.fn(), check: vi.fn(), readEditions: vi.fn(), readHistory: vi.fn(), loadMore: vi.fn() }; });
afterEach(cleanup);
describe("UC026 existing-design publication panel decision boundaries", () => {
  it("opening the normative editor never marks catalogue hints reviewed or persists a decision", () => {
    render(<PublicationCalendarPanel {...props()} />); fireEvent.click(screen.getByRole("button", { name: "Редакции нормативного каталога" }));
    const box = screen.getByRole("checkbox", { name: /Я проверил первоисточники/i }); expect((box as HTMLInputElement).checked).toBe(false); expect(mock.data.mutate).not.toHaveBeenCalled();
  });
  it("requires a fresh normative acknowledgment after switching the requirement", () => {
    render(<PublicationCalendarPanel {...props()} />); fireEvent.click(screen.getByRole("button", { name: "Редакции нормативного каталога" }));
    fireEvent.change(screen.getByLabelText("Что проверено, редакция и ограничения"), { target: { value: "Проверка только первого требования TEST" } });
    const box = screen.getByRole("checkbox", { name: /Я проверил первоисточники/i }); fireEvent.click(box); expect((box as HTMLInputElement).checked).toBe(true);
    const select = screen.getByLabelText("Требование") as HTMLSelectElement;
    const next = [...select.options].find(o => o.value !== select.value)!; fireEvent.change(select, { target: { value: next.value } });
    expect((box as HTMLInputElement).checked).toBe(false); expect((screen.getByLabelText("Что проверено, редакция и ограничения") as HTMLTextAreaElement).value).toBe(""); expect(mock.data.mutate).not.toHaveBeenCalled();
  });
  it("saves an explicit centre approval with exact edition, event CAS, reason and a fresh request", async () => {
    render(<PublicationCalendarPanel {...props()} />); fireEvent.click(screen.getByRole("button", { name: "Утвердить публичную редакцию" }));
    fireEvent.change(screen.getByLabelText("Основание решения центра"), { target: { value: "Только техническое решение TEST" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить решение" }));
    await waitFor(() => expect(mock.data.mutate).toHaveBeenCalledTimes(1));
    expect(mock.data.mutate).toHaveBeenCalledWith("record_organization_publication_action", expect.objectContaining({ p_organization_id: org, p_edition_id: record().edition.id, p_expected_revision: 1, p_expected_event_sequence: 0, p_kind: "approve", p_reason: "Только техническое решение TEST", p_reported_publication_date: null, p_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/) }), true);
    expect(mock.data.check).not.toHaveBeenCalled();
  });
  it("masks a retained edition dialog when read access disappears", () => {
    const h = render(<PublicationCalendarPanel {...props()} />); fireEvent.click(screen.getByRole("button", { name: "История" })); expect(screen.getByRole("dialog")).toBeTruthy();
    h.rerender(<PublicationCalendarPanel {...props()} canRead={false} />); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText("Тестовая публичная редакция")).toBeNull();
  });
  it("does not restore a delayed history dialog into a new access context", async () => {
    let resolve!: (v: unknown) => void; mock.data.readEditions.mockImplementation(() => new Promise(r => { resolve = r; }));
    const h = render(<PublicationCalendarPanel {...props()} />); fireEvent.click(screen.getByRole("button", { name: "Прежние редакции" }));
    mock.data = { ...mock.data, key: "second", data: { ...mock.data.data, records: [] } }; h.rerender(<PublicationCalendarPanel {...props()} />);
    resolve([record()]); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
