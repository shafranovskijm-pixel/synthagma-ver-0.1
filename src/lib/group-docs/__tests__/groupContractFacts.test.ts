import { describe, expect, it, vi } from "vitest";
import {
  loadGroupContractFacts,
  type GroupContractFactRow,
  type GroupContractFactsReader,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupContractFacts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1), GROUP = id(2), COMPANY = id(3), A = id(4), B = id(5), FOREIGN = id(6);
const scope = { organizationId: ORG, groupId: GROUP, studentUserIds: [A, B], fillMode: "data" as const };
const legal = (changes: Partial<GroupContractFactRow> = {}): GroupContractFactRow => ({
  id: id(10), organization_id: ORG, student_group_id: GROUP,
  student_user_id: null, company_id: COMPANY, counterparty_type: "legal",
  contract_number: "ТЕСТ-10", contract_date: "2026-09-05", status: "draft", generation_status: "generated",
  students: [{ user_id: A, full_name: "ТЕСТОВЫЙ СЛУШАТЕЛЬ" }, { user_id: B, full_name: "ТЕСТОВЫЙ СЛУШАТЕЛЬ" }],
  ...changes,
});
const individual = (user = A, contractId = id(11)): GroupContractFactRow => ({
  ...legal(), id: contractId, counterparty_type: "individual", student_user_id: user,
  company_id: null, students: [{ user_id: user, full_name: "ТЕСТОВЫЙ СЛУШАТЕЛЬ", email: "student@example.invalid" }],
  contract_number: `ТЕСТ-${contractId.slice(-3)}`, status: "active", generation_status: "draft",
});
const page = <T,>(data: T[], count: number | null = data.length) => ({ data, count, error: null });
function readerFor(rows: GroupContractFactRow[] = [legal()]): GroupContractFactsReader {
  return {
    contracts: vi.fn<GroupContractFactsReader["contracts"]>().mockImplementation(async ({ contractIds, from, to }) => {
      const selected = rows.filter(row => contractIds.includes(row.id));
      return page(selected.slice(from, to + 1), selected.length);
    }),
    companies: vi.fn<GroupContractFactsReader["companies"]>().mockImplementation(async ({ companyIds }) =>
      page(companyIds.map(companyId => ({ id: companyId, organization_id: ORG })))),
  };
}
const load = (reader = readerFor(), contractIds = [id(10)]) => loadGroupContractFacts({ ...scope, contractIds }, reader);
const expectFailure = (result: Awaited<ReturnType<typeof loadGroupContractFacts>>) => {
  expect(result.line).toBe("");
  expect(result.sources).toEqual([]);
  expect(result.coveredStudentUserIds).toEqual([]);
  expect(result.issues).toEqual([expect.objectContaining({ field: "CONTRACT_BASIS_LINE", severity: "error" })]);
};

describe("explicit caller-RLS contract facts for group pass", () => {
  it("reads only explicit organization/group IDs and a legal company, preserving draft as draft", async () => {
    const reader = readerFor();
    const result = await load(reader);
    expect(reader.contracts).toHaveBeenCalledExactlyOnceWith({ organizationId: ORG, groupId: GROUP, contractIds: [id(10)], from: 0, to: 199 });
    expect(reader.companies).toHaveBeenCalledExactlyOnceWith({ organizationId: ORG, companyIds: [COMPANY], from: 0, to: 199 });
    expect(result.line).toBe("Номер договора: № ТЕСТ-10");
    expect(result.sources).toEqual([{
      id: id(10), organization_id: ORG, student_group_id: GROUP, contract_number: "ТЕСТ-10", contract_date: "2026-09-05",
      status: "draft", generation_status: "generated", counterparty_type: "legal", company_id: COMPANY, student_user_ids: [A, B],
    }]);
    expect(result.coveredStudentUserIds).toEqual([A, B]);
    expect(result.missingStudentUserIds).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/signed|подписан|ТЕСТОВЫЙ СЛУШАТЕЛЬ/);
  });

  it("covers individual students by UUID, even with identical names and reversed returned order", async () => {
    const rows = [individual(B, id(12)), individual(A)];
    const reader = readerFor(rows);
    const result = await load(reader, [id(12), id(11)]);
    expect(result.line).toBe("Номера договоров: № ТЕСТ-011; № ТЕСТ-012");
    expect(result.sources.map(source => source.student_user_ids)).toEqual([[A], [B]]);
    expect(reader.companies).not.toHaveBeenCalled();
    expect(result.issues).toEqual([]);
  });

  it("accepts a legacy individual's default empty students array through the dedicated student link", async () => {
    const reader = readerFor([{ ...individual(), students: [] }, individual(B, id(12))]);
    const result = await load(reader, [id(11), id(12)]);
    expect(result.coveredStudentUserIds).toEqual([A, B]);
    expect(result.issues).toEqual([]);
  });

  it.each(["legal", "individual"])("leaves the whole line blank when %s contracts cover only a subset", async scenario => {
    const row = scenario === "legal" ? legal({ students: [{ user_id: A }] }) : individual();
    const result = await load(readerFor([row]), [row.id]);
    expect(result.line).toBe("");
    expect(result.sources).toHaveLength(1);
    expect(result.coveredStudentUserIds).toEqual([A]);
    expect(result.missingStudentUserIds).toEqual([B]);
    expect(result.issues).toEqual([expect.objectContaining({ code: "contract_coverage_incomplete", severity: "warning" })]);
  });

  it("uses the union of multiple legal subsets without inventing any missing student association", async () => {
    const rows = [legal({ students: [{ user_id: A }] }), legal({ id: id(13), contract_number: "ТЕСТ-13", students: [{ user_id: B }] })];
    const reader = readerFor(rows);
    const result = await load(reader, rows.map(row => row.id));
    expect(result.line).toBe("Номера договоров: № ТЕСТ-10; № ТЕСТ-13");
    expect(result.missingStudentUserIds).toEqual([]);
    expect(reader.companies).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ companyIds: [COMPANY] }));
  });

  it("no selection returns a warning with no contract or company reads", async () => {
    const reader = readerFor();
    const result = await load(reader, []);
    expect(result.line).toBe("");
    expect(result.sources).toEqual([]);
    expect(result.missingStudentUserIds).toEqual([A, B]);
    expect(result.issues).toEqual([expect.objectContaining({ code: "contract_source_missing", severity: "warning" })]);
    expect(reader.contracts).not.toHaveBeenCalled();
    expect(reader.companies).not.toHaveBeenCalled();
  });

  it("blank mode bypasses even invalid selected inputs and never reads sources", async () => {
    const reader = readerFor();
    expect(await loadGroupContractFacts({ ...scope, organizationId: "invalid", contractIds: ["invalid"], fillMode: "blank" }, reader)).toEqual({
      line: "", sources: [], issues: [], coveredStudentUserIds: [], missingStudentUserIds: [],
    });
    expect(reader.contracts).not.toHaveBeenCalled();
    expect(reader.companies).not.toHaveBeenCalled();
  });

  it.each(["draft", "active", "approved", "signed"])("accepts the verified persisted status %s without altering it", async status => {
    const result = await load(readerFor([legal({ status })]));
    expect(result.sources[0].status).toBe(status);
    expect(result.line).toBe("Номер договора: № ТЕСТ-10");
  });

  it.each(["cancelled", "deleted", "failed", "expired", "unknown", "", null])("rejects non-supported contract status %s", async status => {
    expectFailure(await load(readerFor([legal({ status: status as string })])));
  });
  it.each(["failed", "unknown", "", null])("rejects non-supported generation status %s", async generation_status => {
    expectFailure(await load(readerFor([legal({ generation_status: generation_status as string })])));
  });

  it.each([
    { organization_id: FOREIGN }, { student_group_id: FOREIGN }, { student_group_id: null },
    { counterparty_type: "three-party" }, { counterparty_type: null },
    { contract_number: null }, { contract_number: "  " }, { contract_number: "bad\nnumber" },
    { contract_date: "2026-02-30" }, { contract_date: "not a date" },
    { company_id: null }, { company_id: "bad-id" }, { student_user_id: A },
    { students: [] }, { students: null }, { students: {} }, { students: [null] },
    { students: [{ full_name: "Name is not an ID" }] }, { students: [{ user_id: "bad-id" }] },
    { students: [{ user_id: A }, { user_id: A }] }, { students: [{ user_id: FOREIGN }] },
  ])("rejects malformed or foreign legal facts %j without partial source leakage", async changes => {
    const reader = readerFor([legal(changes), individual(B, id(12))]);
    expectFailure(await load(reader, [id(10), id(12)]));
    expect(reader.companies).not.toHaveBeenCalled();
  });

  it.each([
    { student_user_id: null }, { student_user_id: FOREIGN }, { student_user_id: "bad-id" },
    { company_id: COMPANY }, { students: [{ user_id: B }] }, { students: [{ user_id: A }, { user_id: B }] },
  ])("rejects conflicting individual associations %j", async changes => {
    expectFailure(await load(readerFor([{ ...individual(), ...changes }]), [id(11)]));
  });

  it("keeps a saved number with a null date and does not invent a date", async () => {
    const result = await load(readerFor([legal({ contract_date: null })]));
    expect(result.sources[0].contract_date).toBeNull();
    expect(result.line).toBe("Номер договора: № ТЕСТ-10");
  });

  it.each(["missing", "foreign-tenant", "foreign-id", "duplicate", "truncated", "no-count", "thrown"])("fails closed for %s company verification", async kind => {
    const reader = readerFor();
    vi.mocked(reader.companies).mockImplementation(async () => {
      if (kind === "thrown") throw new Error("SECRET read error");
      if (kind === "missing") return page([]);
      const row = { id: kind === "foreign-id" ? FOREIGN : COMPANY, organization_id: kind === "foreign-tenant" ? FOREIGN : ORG };
      if (kind === "duplicate") return page([row, row]);
      if (kind === "truncated") return page([], 1);
      return page([row], kind === "no-count" ? null : 1);
    });
    const result = await load(reader);
    expectFailure(result);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it.each(["missing", "missing-one", "foreign-id", "duplicate", "truncated", "no-count", "count-too-low", "thrown", "error"])("fails closed for %s contract read without fallback", async kind => {
    const reader = readerFor();
    vi.mocked(reader.contracts).mockImplementation(async () => {
      if (kind === "thrown") throw new Error("SECRET connection error");
      if (kind === "error") return { ...page([]), error: "SECRET RLS error" };
      if (kind === "missing") return page([]);
      if (kind === "missing-one") return page([legal()]);
      if (kind === "foreign-id") return page([legal({ id: FOREIGN })]);
      if (kind === "duplicate") return page([legal(), legal()]);
      if (kind === "truncated") return page([], 1);
      return page([legal()], kind === "no-count" ? null : 0);
    });
    const result = await load(reader, kind === "missing-one" ? [id(10), id(12)] : [id(10)]);
    expectFailure(result);
    expect(reader.contracts).toHaveBeenCalledTimes(1);
    expect(reader.companies).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it.each([
    { contractIds: [id(10), id(10)] }, { contractIds: ["invalid"] },
    { organizationId: "invalid" }, { groupId: "invalid" },
    { studentUserIds: [A, A] }, { studentUserIds: ["invalid"] }, { studentUserIds: [] },
  ])("rejects malformed or duplicate input %j before reads", async changes => {
    const reader = readerFor();
    expectFailure(await loadGroupContractFacts({ ...scope, contractIds: [id(10)], ...changes }, reader));
    expect(reader.contracts).not.toHaveBeenCalled();
    expect(reader.companies).not.toHaveBeenCalled();
  });

  it("chunks explicit IDs and completes small server pages using exact counts", async () => {
    const rows = Array.from({ length: 205 }, (_, i) => legal({ id: id(1000 + i), company_id: id(2000 + i), contract_number: `ТЕСТ-${i}` }));
    const reader = readerFor(rows);
    vi.mocked(reader.contracts).mockImplementation(async ({ contractIds, from }) => {
      expect(contractIds.length).toBeLessThanOrEqual(100);
      const selected = rows.filter(row => contractIds.includes(row.id));
      return page(selected.slice(from, from + 40), selected.length);
    });
    vi.mocked(reader.companies).mockImplementation(async ({ companyIds, from }) => {
      expect(companyIds.length).toBeLessThanOrEqual(100);
      return page(companyIds.slice(from, from + 40).map(companyId => ({ id: companyId, organization_id: ORG })), companyIds.length);
    });
    const result = await load(reader, rows.map(row => row.id));
    expect(result.sources).toHaveLength(205);
    expect(result.issues).toEqual([]);
    expect(reader.contracts).toHaveBeenCalledTimes(7);
    expect(reader.companies).toHaveBeenCalledTimes(7);
    expect(result.coveredStudentUserIds).toEqual([A, B]);
  });

  it("discards all earlier pages if the contract count changes during pagination", async () => {
    const rows = [legal(), legal({ id: id(13) })];
    const reader = readerFor(rows);
    vi.mocked(reader.contracts).mockResolvedValueOnce(page([rows[0]], 2)).mockResolvedValueOnce(page([rows[1]], 3));
    const result = await load(reader, rows.map(row => row.id));
    expectFailure(result);
    expect(result.issues[0].code).toBe("contract_source_changed");
    expect(reader.companies).not.toHaveBeenCalled();
  });
});
