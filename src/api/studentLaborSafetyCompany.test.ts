import { describe, expect, it } from "vitest";
import {
  assignStudentLaborSafetyCompany,
  createStudentLaborSafetyCompany,
  fetchStudentLaborSafetyCompanies,
  updateStudentLaborSafetyCompany,
} from "@/api/studentLaborSafetyCompany";

interface QueryLog {
  table: string;
  eq: Array<[string, unknown]>;
  insert?: unknown;
  update?: unknown;
}

function createClient(responses: Record<string, Array<{ data: any; error: any }>>) {
  const logs: QueryLog[] = [];
  return {
    logs,
    from(table: string) {
      const log: QueryLog = { table, eq: [] };
      logs.push(log);
      const next = () => responses[table]?.shift() ?? { data: null, error: null };
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => { log.eq.push([column, value]); return query; },
        order: () => Promise.resolve(next()),
        maybeSingle: () => Promise.resolve(next()),
        single: () => Promise.resolve(next()),
        insert: (value: unknown) => { log.insert = value; return query; },
        update: (value: unknown) => { log.update = value; return query; },
      };
      return query;
    },
  };
}

describe("studentLaborSafetyCompany API", () => {
  it("lists only companies from the active organization", async () => {
    const client = createClient({
      companies: [{ data: [{ id: "company-1", name: "ООО Тест", inn: "7707083893" }], error: null }],
    });

    const result = await fetchStudentLaborSafetyCompanies("org-1", client as never);

    expect(result).toEqual([{ id: "company-1", name: "ООО Тест", inn: "7707083893" }]);
    expect(client.logs[0].eq).toContainEqual(["organization_id", "org-1"]);
  });

  it("confirms the company tenant before assigning it to the exact student profile", async () => {
    const client = createClient({
      companies: [{ data: { id: "company-1", name: "ООО Тест", inn: "7707083893" }, error: null }],
      profiles: [{ data: { user_id: "student-1", company_id: "company-1" }, error: null }],
    });

    const result = await assignStudentLaborSafetyCompany({
      organizationId: "org-1",
      userId: "student-1",
      companyId: "company-1",
    }, client as never);

    expect(result.id).toBe("company-1");
    expect(client.logs[0].eq).toEqual(expect.arrayContaining([
      ["organization_id", "org-1"],
      ["id", "company-1"],
    ]));
    expect(client.logs[1].update).toEqual({ company_id: "company-1" });
    expect(client.logs[1].eq).toEqual(expect.arrayContaining([
      ["organization_id", "org-1"],
      ["user_id", "student-1"],
    ]));
  });

  it("creates a tenant-scoped company only with a valid INN checksum", async () => {
    const client = createClient({
      companies: [{ data: { id: "company-new", name: "ООО Новая", inn: "7707083893" }, error: null }],
    });

    await expect(createStudentLaborSafetyCompany({
      organizationId: "org-1",
      name: " ООО Новая ",
      inn: "7707 083 893",
    }, client as never)).resolves.toEqual({ id: "company-new", name: "ООО Новая", inn: "7707083893" });
    expect(client.logs[0].insert).toEqual({
      organization_id: "org-1",
      name: "ООО Новая",
      inn: "7707083893",
    });

    await expect(createStudentLaborSafetyCompany({
      organizationId: "org-1",
      name: "ООО Ошибка",
      inn: "1234567890",
    }, client as never)).rejects.toThrow("контрольная сумма");
  });

  it("updates company requisites with organization and company scoping", async () => {
    const client = createClient({
      companies: [{ data: { id: "company-1", name: "ООО Исправлено", inn: "7707083893" }, error: null }],
    });

    const result = await updateStudentLaborSafetyCompany({
      organizationId: "org-1",
      companyId: "company-1",
      name: "ООО Исправлено",
      inn: "7707083893",
    }, client as never);

    expect(result.name).toBe("ООО Исправлено");
    expect(client.logs[0].update).toEqual({ name: "ООО Исправлено", inn: "7707083893" });
    expect(client.logs[0].eq).toEqual(expect.arrayContaining([
      ["organization_id", "org-1"],
      ["id", "company-1"],
    ]));
  });
});
