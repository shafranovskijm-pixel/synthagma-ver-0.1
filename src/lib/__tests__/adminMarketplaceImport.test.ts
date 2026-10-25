import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { knownPrograms } from "@/data/knownPrograms";
import { AdminMarketplaceImportError, findProgramsInImportedText, importAdminMarketplaceFile, readAdminImportedDocument, resolveAdminMarketplaceImportScope, type AdminMarketplaceImportOperation } from '../adminMarketplaceImport.ts';

const mocks = vi.hoisted(() => ({ role: vi.fn(), permission: vi.fn(), organization: vi.fn(), invoke: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (name: string, args: Record<string, unknown>) => name === "get_user_role" ? mocks.role(args) : mocks.permission(args),
  from: (table: string) => { mocks.from(table); const query = { select: () => query, eq: () => query, single: () => mocks.organization() }; return query; },
} }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: (...args: unknown[]) => mocks.invoke(...args) }));

const documentResponse = () => ({ success: true, lessons: [
  { title: "Раздел первый", content: "<p>Первый материал.</p><table><tr><th>Показатель</th><th>Значение</th></tr><tr><td>Температура</td><td>20 °C</td></tr></table>" },
  { title: "Раздел второй", content: "<h3>Второй материал</h3><p>Завершающий абзац.</p>" },
] });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ data: "admin", error: null });
  mocks.permission.mockResolvedValue({ data: true, error: null });
  mocks.organization.mockResolvedValue({ data: { id: MARKETPLACE_ORG_ID }, error: null });
  mocks.invoke.mockResolvedValue({ data: documentResponse(), error: null });
});

describe("fixed platform-admin marketplace import contract", () => {
  it("verifies the canonical role, exact existing marketplace organization and courses.write", async () => {
    await expect(resolveAdminMarketplaceImportScope("admin-a", () => {})).resolves.toEqual({ organizationId: MARKETPLACE_ORG_ID });
    expect(mocks.role).toHaveBeenCalledWith({ _user_id: "admin-a" });
    expect(mocks.from).toHaveBeenCalledWith("organizations");
    expect(mocks.permission).toHaveBeenCalledWith({ _organization_id: MARKETPLACE_ORG_ID, _permission: "courses.write" });
  });

  it.each([null, "student", "organization", undefined])("denies role %s without a fallback or organization read", async role => {
    mocks.role.mockResolvedValue({ data: role, error: null });
    await expect(resolveAdminMarketplaceImportScope("admin-a", () => {})).rejects.toMatchObject({ kind: "scope" });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
  });

  it.each(["role-error", "organization-error", "other-organization", "permission-error", "permission-null", "permission-false"])("denies %s before invoking a parser", async mode => {
    if (mode === "role-error") mocks.role.mockResolvedValue({ data: "admin", error: new Error("offline") });
    if (mode === "organization-error") mocks.organization.mockResolvedValue({ data: null, error: new Error("offline") });
    if (mode === "other-organization") mocks.organization.mockResolvedValue({ data: { id: "customer-org" }, error: null });
    if (mode.startsWith("permission")) mocks.permission.mockResolvedValue({ data: mode === "permission-error" ? true : mode === "permission-null" ? null : false, error: mode === "permission-error" ? new Error("offline") : null });
    await expect(resolveAdminMarketplaceImportScope("admin-a", () => {})).rejects.toBeInstanceOf(AdminMarketplaceImportError);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("sends the exact confirmed organization_id and file to the unchanged Edge handler", async () => {
    const file = new File(["synthetic"], "lecture.docx");
    const operation: AdminMarketplaceImportOperation = {
      assertCurrent: vi.fn(), isCurrent: () => true, verify: vi.fn(async () => ({ organizationId: MARKETPLACE_ORG_ID })), finish: vi.fn(),
    };
    await importAdminMarketplaceFile(file, operation);
    expect(mocks.invoke).toHaveBeenCalledOnce();
    const [name, options] = mocks.invoke.mock.calls[0];
    expect(name).toBe("import-course");
    expect(options.body.get("organization_id")).toBe(MARKETPLACE_ORG_ID);
    expect(options.body.get("file")).toBe(file);
  });

  it("rejects a fabricated customer scope without invoking Edge", async () => {
    const operation = { assertCurrent: () => {}, isCurrent: () => true, verify: async () => ({ organizationId: "customer-org" }), finish: () => {} };
    await expect(importAdminMarketplaceFile(new File(["x"], "x.docx"), operation)).rejects.toMatchObject({ kind: "scope" });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("preserves every lesson and table cell in reusable block JSON", () => {
    const result = readAdminImportedDocument(documentResponse());
    const blocks = JSON.parse(result.content);
    expect(blocks.filter((block: { type: string }) => block.type === "heading2").map((block: { content: string }) => block.content)).toEqual(["Раздел первый", "Раздел второй"]);
    expect(blocks.find((block: { type: string }) => block.type === "table")).toMatchObject({ tableRows: [["Показатель", "Значение"], ["Температура", "20 °C"]], tableCellsHtml: true });
    expect(result.text).toContain("Первый материал.");
    expect(result.text).toContain("Завершающий абзац.");
    expect(result.text).toContain("Температура 20 °C");
  });

  it.each([null, { text: "obsolete" }, { success: false, lessons: documentResponse().lessons }, { success: true, lessons: [] },
    { success: true, lessons: [{ title: "x", content: 42 }] }, { success: true, lessons: [{ title: "", content: "<p>x</p>" }] },
    { success: true, lessons: [{ title: "x", content: "<script>alert(1)</script>" }] },
    { success: true, lessons: [...documentResponse().lessons, { title: "bad", content: "" }] },
  ])("rejects malformed/empty input instead of manufacturing empty content: %j", response => {
    expect(() => readAdminImportedDocument(response)).toThrow(AdminMarketplaceImportError);
  });

  it("escapes lesson titles before storing them as block HTML", () => {
    const result = readAdminImportedDocument({ success: true, lessons: [{ title: "<img src=x onerror=alert(1)>", content: "<p>Безопасный текст</p>" }] });
    expect(JSON.parse(result.content)[0].content).toBe("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("matches a complete known title, not all programs sharing its first three words", () => {
    expect(findProgramsInImportedText(`1. ${knownPrograms[0].title} — 16 часов`)).toEqual([knownPrograms[0]]);
  });

  it("does not select a shorter prefix program unless it also occurs independently", () => {
    const short = knownPrograms.find(program => program.title === "Изолировщик")!;
    const long = knownPrograms.find(program => program.title === "Изолировщик на термоизоляции")!;
    expect(findProgramsInImportedText(long.title)).toEqual([long]);
    expect(findProgramsInImportedText(`${long.title}\n${short.title}`)).toEqual([short, long]);
  });

  it.each(["", "Неизвестный перечень", "Программа обучения"])('has no full-list fallback for "%s"', text => {
    expect(findProgramsInImportedText(text)).toEqual([]);
  });
});
