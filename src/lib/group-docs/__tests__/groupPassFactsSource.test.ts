import { describe, expect, it, vi } from "vitest";
import {
  loadGroupPassFacts, type GroupPassFactsReader, type PassContactFactRow,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupPassFactsSource";

const scope = { organizationId: "org", groupId: "group", studentUserIds: ["u1"] };
const contact = (user_id = "u1"): PassContactFactRow => ({
  id: `profile-${user_id}`, user_id, organization_id: "org", student_group_id: "group",
  archived_at: null, phone: "phone", company_id: "company",
});
const reader = (): GroupPassFactsReader => ({
  contacts: vi.fn<GroupPassFactsReader["contacts"]>().mockResolvedValue({ data: [contact()], count: 1, error: null }),
  companies: vi.fn<GroupPassFactsReader["companies"]>().mockResolvedValue({ data: [{ id: "company", organization_id: "org", name: "Компания" }], count: 1, error: null }),
});

describe("caller-scoped pass contacts and companies", () => {
  it("uses exact checked roster/tenant IDs and derives companies only from returned contacts", async () => {
    const r = reader();
    const result = await loadGroupPassFacts(scope, r);
    expect(r.contacts).toHaveBeenCalledWith({ ...scope, from: 0, to: 199 });
    expect(r.companies).toHaveBeenCalledWith({ organizationId: "org", companyIds: ["company"], from: 0, to: 199 });
    expect(result.contacts).toEqual([contact()]);
    expect(result.companies).toHaveLength(1);
    expect(result.sourceIssues).toEqual([]);
  });
  it("does not query an empty roster or infer a company from group context", async () => {
    const r = reader();
    expect(await loadGroupPassFacts({ ...scope, studentUserIds: [] }, r)).toEqual({ contacts: [], companies: [], sourceIssues: [] });
    expect(r.contacts).not.toHaveBeenCalled();
    expect(r.companies).not.toHaveBeenCalled();
  });
  it("leaves RLS-hidden contacts unavailable without a service-role retry", async () => {
    const r = reader();
    vi.mocked(r.contacts).mockResolvedValue({ data: [], count: 0, error: null });
    const result = await loadGroupPassFacts(scope, r);
    expect(result.contacts).toEqual([]);
    expect(r.contacts).toHaveBeenCalledTimes(1);
    expect(r.companies).not.toHaveBeenCalled();
  });
  it.each([
    { organization_id: "foreign" }, { student_group_id: "foreign" },
    { user_id: "outside" }, { archived_at: "2026-09-01" }, { id: "" },
  ])("rejects a contact scope violation %j", async (change) => {
    const r = reader();
    vi.mocked(r.contacts).mockResolvedValue({ data: [{ ...contact(), ...change }], count: 1, error: null });
    const result = await loadGroupPassFacts(scope, r);
    expect(result.contacts).toEqual([]);
    expect(result.sourceIssues).toContainEqual(expect.objectContaining({ source: "pass_contacts", code: "scope_mismatch" }));
    expect(r.companies).not.toHaveBeenCalled();
  });
  it("rejects duplicate user profiles even with distinct row IDs", async () => {
    const r = reader();
    vi.mocked(r.contacts).mockResolvedValue({ data: [contact(), { ...contact(), id: "different", company_id: "other" }], count: 2, error: null });
    const result = await loadGroupPassFacts(scope, r);
    expect(result.contacts).toEqual([]);
    expect(result.sourceIssues[0].code).toBe("source_changed");
    expect(r.companies).not.toHaveBeenCalled();
  });
  it("chunks large groups and rejects a failed later chunk without keeping partial contacts", async () => {
    const r = reader();
    const users = Array.from({ length: 205 }, (_, i) => `u${String(i).padStart(3, "0")}`);
    vi.mocked(r.contacts).mockImplementation(async ({ studentUserIds }) => ({
      data: studentUserIds.map(contact), count: studentUserIds.length, error: studentUserIds.length === 5 ? "failed" : null,
    }));
    const result = await loadGroupPassFacts({ ...scope, studentUserIds: users }, r);
    expect(r.contacts).toHaveBeenCalledTimes(3);
    expect(result.contacts).toEqual([]);
    expect(result.sourceIssues[0].code).toBe("read_failed");
    expect(r.companies).not.toHaveBeenCalled();
  });
  it.each(["wrong-tenant", "wrong-id", "truncated", "thrown"])("keeps contacts, discards the whole %s company source", async (kind) => {
    const r = reader();
    vi.mocked(r.companies).mockImplementation(async () => {
      if (kind === "thrown") throw new Error("connection lost");
      return { data: kind === "truncated" ? [] : [{ id: kind === "wrong-id" ? "other" : "company", organization_id: kind === "wrong-tenant" ? "foreign" : "org", name: "Secret" }], count: 1, error: null };
    });
    const result = await loadGroupPassFacts(scope, r);
    expect(result.contacts).toEqual([contact()]);
    expect(result.companies).toEqual([]);
    expect(result.sourceIssues[0].source).toBe("companies");
    expect(JSON.stringify(result)).not.toContain("Secret");
  });
  it("deduplicates requested users and company IDs without merging distinct pupils", async () => {
    const r = reader();
    vi.mocked(r.contacts).mockResolvedValue({ data: [contact(), contact("u2")], count: 2, error: null });
    const result = await loadGroupPassFacts({ ...scope, studentUserIds: ["u2", "u1", "u1"] }, r);
    expect(result.contacts).toHaveLength(2);
    expect(r.companies).toHaveBeenCalledWith(expect.objectContaining({ companyIds: ["company"] }));
  });
});
