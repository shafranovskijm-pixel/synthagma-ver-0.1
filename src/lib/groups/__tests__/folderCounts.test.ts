import { describe, it, expect, vi } from "vitest";
import { fetchGroupFolderCounts, countUniqueContracts, countIdentityDocs } from "../folderCounts";

const ORG = "7237f9d4-3670-4a19-8946-a43c68fd3473";
const GROUP = "0cd9dd54-af40-4899-bd94-9d3c1a728d38";

interface FakeData {
  profiles: any[];
  org_contracts: any[];
  group_documents: any[];
  student_identity_documents: any[];
  test_attempts: any[];
}

/** Минимальный чейнящийся фейк supabase-клиента. */
function makeClient(data: FakeData, calls: any[] = []) {
  const builder = (table: keyof FakeData) => {
    const rec: any = { table, filters: [] as string[] };
    calls.push(rec);
    const api: any = {
      select: (cols: string) => { rec.select = cols; return api; },
      eq: (c: string, v: any) => { rec.filters.push(`eq:${c}=${v}`); return api; },
      in: (c: string, v: any[]) => { rec.filters.push(`in:${c}=${v.join(",")}`); return api; },
      or: (expr: string) => { rec.filters.push(`or:${expr}`); return api; },
      then: (resolve: any) => resolve({ data: data[table] }),
    };
    return api;
  };
  return { from: (table: keyof FakeData) => builder(table) };
}

const acceptanceData: FakeData = {
  profiles: [{ user_id: "u1" }, { user_id: "u2" }],
  org_contracts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
  group_documents: Array.from({ length: 19 }, (_, i) => ({ id: `d${i}` })),
  student_identity_documents: [
    { user_id: "u1", type: "passport" },
    { user_id: "u1", type: "snils" },
    { user_id: "u2", type: "passport" },
  ],
  test_attempts: [{ id: "a1" }],
};

describe("group folder counts", () => {
  it("counts unique contracts even when a row matches both group and student filters", () => {
    expect(countUniqueContracts([{ id: "c1" }, { id: "c1" }, { id: "c2" }])).toBe(2);
    expect(countUniqueContracts(null)).toBe(0);
  });

  it("splits identity documents by type", () => {
    expect(countIdentityDocs(acceptanceData.student_identity_documents)).toEqual({ passports: 2, snils: 1 });
  });

  it("initial load returns contracts=3 and group documents=19 for the acceptance group", async () => {
    const calls: any[] = [];
    const counts = await fetchGroupFolderCounts(makeClient(acceptanceData, calls), ORG, GROUP);
    expect(counts).toEqual({ contracts: 3, docs: 19, passports: 2, snils: 1, exams: 1 });

    const contracts = calls.find(c => c.table === "org_contracts");
    expect(contracts.filters).toContain(`eq:organization_id=${ORG}`);
    expect(contracts.filters.some((f: string) => f.startsWith("or:student_group_id.eq."))).toBe(true);

    const docs = calls.find(c => c.table === "group_documents");
    expect(docs.filters).toEqual(expect.arrayContaining([
      `eq:organization_id=${ORG}`, `eq:group_id=${GROUP}`, "eq:status=active",
    ]));
  });

  it("falls back to group-scoped contracts when the group has no students", async () => {
    const calls: any[] = [];
    const counts = await fetchGroupFolderCounts(
      makeClient({ ...acceptanceData, profiles: [] }, calls),
      ORG,
      GROUP,
    );
    expect(counts.contracts).toBe(3);
    expect(counts.passports).toBe(0);
    expect(counts.snils).toBe(0);
    expect(counts.exams).toBe(0);
    const contracts = calls.find(c => c.table === "org_contracts");
    expect(contracts.filters).toContain(`eq:student_group_id=${GROUP}`);
  });

  it("refetch after generation reflects newly persisted rows", async () => {
    const data: FakeData = {
      profiles: [{ user_id: "u1" }, { user_id: "u2" }],
      org_contracts: [],
      group_documents: [],
      student_identity_documents: [],
      test_attempts: [],
    };
    const client = makeClient(data);
    const before = await fetchGroupFolderCounts(client, ORG, GROUP);
    expect(before.contracts).toBe(0);
    expect(before.docs).toBe(0);

    // Генерация пакета: 3 договора + 19 документов группы сохранены в БД.
    data.org_contracts = acceptanceData.org_contracts;
    data.group_documents = acceptanceData.group_documents;

    const after = await fetchGroupFolderCounts(client, ORG, GROUP);
    expect(after.contracts).toBe(3);
    expect(after.docs).toBe(19);
  });

  it("returns zeros without ids", async () => {
    const spy = vi.fn();
    const counts = await fetchGroupFolderCounts({ from: spy }, "", GROUP);
    expect(counts).toEqual({ contracts: 0, docs: 0, passports: 0, snils: 0, exams: 0 });
    expect(spy).not.toHaveBeenCalled();
  });
});
