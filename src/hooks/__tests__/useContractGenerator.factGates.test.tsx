import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ template: "", from: vi.fn(), rpc: vi.fn(), print: vi.fn(), download: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("@/lib/documents/downloadHtmlWord", () => ({ downloadHtmlWord: mocks.download }));
vi.mock("@/utils/printHtmlToPdf", () => ({ printHtmlContent: mocks.print }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
import { useContractGenerator } from "../useContractGenerator";
import { createEmptyEducationProfile } from "@/lib/uc-compliance/model";
import { approvedBinding } from "@/lib/contracts/__tests__/contractFacts.fixture";

const organizationId = "10000000-0000-4000-8000-000000000001", course = "10000000-0000-4000-8000-000000000002";
const company = { id: "company", name: "Actual customer", inn: "123", kpp: "456", ogrn: "789", address: "Actual address", director: "Actual director" };
const orgRequisites = { name: "Actual organization", inn: "123", kpp: "456", ogrn: "789", legal_address: "Actual legal address", actual_address: "Actual address", director_name: "Actual director", director_position: "Директор", bank_name: "Actual bank", bank_bik: "123", bank_account: "123", bank_corr_account: "456" };
function props() { return { organizationId, isOpen: true, orgRequisites, preselectedCompany: company, onSave: vi.fn(), onClose: vi.fn() }; }
async function ready(input = props()) {
  const hook = renderHook(() => useContractGenerator(input));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(hook.result.current.courses).toHaveLength(1);
  act(() => { hook.result.current.updateProgram(0, { courseId: course, price: "3500", studentsCount: "2" }); });
  return { ...hook, input };
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.template = "{{company_name}} / {{org_license_number}}";
  mocks.print.mockResolvedValue(undefined); mocks.download.mockResolvedValue(true);
  mocks.rpc.mockImplementation(async () => ({ data: { organization_id: organizationId, revision: 0, profile: createEmptyEducationProfile() }, error: null }));
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table === "courses" ? [{ id: course, title: "Actual course", duration: "16", frdo_duration_hours: 16 }]
      : table === "companies" ? [company] : { branding: { contractTemplates: [{ id: "custom-preserved", text: mocks.template, isBuiltIn: false }], activeContractTemplateId: "custom-preserved" } }, error: null };
    const query = { select: () => query, eq: () => query, order: async () => result, single: async () => result };
    return query;
  });
});
afterEach(cleanup);

describe("Real contract output gates (new focused cases only)", () => {
  it("prints new license facts as literal text with no active markup", async () => {
    mocks.template = "Recorded {{org_license_number}} / {{org_license_issuer}}";
    const profile = createEmptyEducationProfile();
    const number = 'N & <19>', authority = '<img src="https://example.invalid/profile-tracker" onerror="alert(1)"> & "Authority"';
    profile.license = { ...profile.license, status: "declared_active", registryNumber: number, authority };
    mocks.rpc.mockResolvedValue({ data: { organization_id: organizationId, revision: 3, profile }, error: null });
    const { result } = await ready();
    await act(async () => { await result.current.handleGenerate(); });
    expect(mocks.print).toHaveBeenCalledOnce();
    const html = mocks.print.mock.calls[0][0] as string;
    expect(html).toContain('N &amp; &lt;19&gt;'); expect(html).toContain('&lt;img');
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelector('img,script,iframe,object,embed')).toBeNull();
    expect(document.body.textContent).toContain(number + ' / ' + authority);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("blocks an older deferred generation after closing and reopening the same organization", async () => {
    mocks.template = "Saved {{education_form}}";
    let resolveBinding!: (value: unknown) => void;
    mocks.rpc.mockImplementation(() => new Promise(resolve => { resolveBinding = resolve; }));
    const input = props();
    const hook = renderHook(current => useContractGenerator(current), { initialProps: input });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    act(() => hook.result.current.updateProgram(0, { courseId: course, price: "3500", studentsCount: "1" }));
    let pending!: Promise<void>;
    act(() => { pending = hook.result.current.handleSaveContract(); });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    hook.rerender({ ...input, isOpen: false });
    hook.rerender({ ...input, isOpen: true });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => { resolveBinding({ data: approvedBinding(), error: null }); await pending; });
    expect(input.onSave).not.toHaveBeenCalled(); expect(mocks.print).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
    expect(hook.result.current.previewHtml).toBe(""); expect(hook.result.current.showPreview).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Не удалось проверить сведения"));
  });

  it.each(["handlePreview", "handleGenerate", "handleDownloadDOC", "handleSaveContract"] as const)("%s stops before output/write when a requested license fact is absent", async method => {
    const { result, input } = await ready();
    await act(async () => { await result.current[method](); });
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Номер лицензии организации"));
    expect(result.current.previewHtml).toBe(""); expect(result.current.showPreview).toBe(false);
    expect(mocks.print).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled(); expect(input.onSave).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_organization_education_profile", { p_organization_id: organizationId });
  });

  it("preserves saved custom wording and the existing onSave path, price and unconfirmed programme notice", async () => {
    mocks.template = "Мой сохранённый текст. {{company_name}}. {{total_price}}. {{contract_date}}.";
    const original = mocks.template, { result, input } = await ready();
    await act(async () => { await result.current.handleSaveContract(); });
    expect(input.onSave).toHaveBeenCalledOnce();
    const [html, number, customer, courseId, amount, students] = input.onSave.mock.calls[0];
    expect(html).toContain("Мой сохранённый текст. Actual customer."); expect(html).not.toContain("{{");
    expect(html).toContain('data-sintagma-program-state="unconfirmed"');
    expect(number).toBe(result.current.contractNumber); expect(customer).toBe(company.name); expect(courseId).toBe(course); expect(amount).toBe(7000); expect(students).toBe(2);
    expect(mocks.template).toBe(original); expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects unknown saved placeholders before a save or a sample fallback", async () => {
    mocks.template = "Saved text {{invented_fact}}";
    const { result, input } = await ready();
    await act(async () => { await result.current.handleSaveContract(); });
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("неизвестная или неподставленная"));
    expect(input.onSave).not.toHaveBeenCalled();
  });

  it("also blocks a placeholder hidden in the appended signature before printing", async () => {
    mocks.template = "Saved text {{company_name}}";
    const input = props(); input.orgRequisites = { ...orgRequisites, director_name: "{{unbound_signature}}" };
    const { result } = await ready(input);
    await act(async () => { await result.current.handleGenerate(); });
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("неизвестная или неподставленная"));
    expect(mocks.print).not.toHaveBeenCalled();
  });
});
