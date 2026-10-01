import { describe, expect, it, vi } from "vitest";
import { persistStudentJobPosition } from "./student-job-position";

const input = { userId: "student-1", organizationId: "org-1", jobPosition: "Водитель", staffAuthorized: true, publicRegistration: false };

function database(options: { organizationId?: string; archived?: boolean; error?: boolean; missing?: boolean; throws?: boolean; changedValue?: boolean } = {}) {
  const row = { user_id: "student-1", organization_id: options.organizationId || "org-1", job_position: "Механик", archived_at: options.archived ? "2026-09-30" : null };
  const filters: Record<string, unknown> = {};
  let values: { job_position: string };
  const chain = {
    eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
    is: (key: string, value: unknown) => { filters[key] = value; return chain; },
    select: () => chain,
    maybeSingle: async () => {
      if (options.throws) throw new Error("network");
      if (options.error) return { data: null, error: { code: "42501" } };
      if (options.missing || Object.entries(filters).some(([key, value]) => row[key as keyof typeof row] !== value)) return { data: null, error: null };
      row.job_position = options.changedValue ? "Unexpected" : values.job_position;
      return { data: { ...row }, error: null };
    },
  };
  const client = { from: vi.fn(() => ({ update: vi.fn((value: { job_position: string }) => { values = value; return chain; }) })) };
  return { client, row, filters };
}

describe("staff job position persistence", () => {
  it("persists the exact current position and permits an idempotent retry", async () => {
    const db = database();
    expect(await persistStudentJobPosition(db.client, input)).toBe(true);
    expect(await persistStudentJobPosition(db.client, input)).toBe(true);
    expect(db.row.job_position).toBe("Водитель");
    expect(db.filters).toEqual({ user_id: "student-1", organization_id: "org-1", archived_at: null });
  });
  it("leaves an existing position unchanged for an empty import cell", async () => {
    const db = database();
    expect(await persistStudentJobPosition(db.client, { ...input, jobPosition: undefined })).toBeUndefined();
    expect(db.client.from).not.toHaveBeenCalled();
    expect(db.row.job_position).toBe("Механик");
  });
  it.each([{ publicRegistration: true }, { staffAuthorized: false }])("refuses unauthorized writes %j", async (override) => {
    const db = database();
    expect(await persistStudentJobPosition(db.client, { ...input, ...override })).toBe(false);
    expect(db.client.from).not.toHaveBeenCalled();
  });
  it.each([{ organizationId: "other-org" }, { archived: true }])("cannot change another tenant or an archived profile %j", async (options) => {
    const db = database(options);
    expect(await persistStudentJobPosition(db.client, input)).toBe(false);
    expect(db.row.job_position).toBe("Механик");
  });
  it.each([{ error: true }, { missing: true }, { throws: true }, { changedValue: true }])("requires exact persistence confirmation %j", async (options) => {
    expect(await persistStudentJobPosition(database(options).client, input)).toBe(false);
  });
});
