import { describe, expect, it, vi } from "vitest";
import {
  fetchStudentLaborSafetyProtocol,
  fetchStudentLaborSafetyProtocols,
  saveStudentLaborSafetyProtocol,
} from "@/api/studentLaborSafetyProtocol";
import type { LaborSafetyEnrollmentProtocol } from "@/types/laborSafetyProtocol";

const protocol: LaborSafetyEnrollmentProtocol = {
  id: "protocol-1", organization_id: "org-1", enrollment_id: "enr-1",
  source_enrollment_id: "enr-1", source_user_id: "student-1", source_course_id: "course-1",
  learner_name_snapshot: "Тестовый ученик", course_title_snapshot: "Программа А",
  protocol_number: "ОТ-7", knowledge_check_date: "2026-09-01", is_passed: false,
  version: 1, created_by: "operator-1", updated_by: "operator-1",
  created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
};
const input = {
  organizationId: "org-1", enrollmentId: "enr-1", protocolNumber: " ОТ-7 ",
  knowledgeCheckDate: "2026-09-01", isPassed: false, expectedVersion: null,
};

function client(readData: unknown = protocol, readError: unknown = null, rpcData: unknown = [protocol], rpcError: unknown = null) {
  const eq: Array<[string, unknown]> = [];
  const inFilters: Array<[string, unknown[]]> = [];
  const query: any = {
    select: () => query,
    eq: (key: string, value: unknown) => { eq.push([key, value]); return query; },
    in: (key: string, value: unknown[]) => { inFilters.push([key, value]); return query; },
    maybeSingle: () => Promise.resolve({ data: readData, error: readError }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: readData, error: readError }).then(resolve),
  };
  return { eq, inFilters, from: vi.fn(() => query), rpc: vi.fn(async (..._args: unknown[]) => ({ data: rpcData, error: rpcError })) };
}

describe("student labor-safety protocol persistence", () => {
  it.each(["source_user_id", "source_course_id"] as const)("rejects changed %s in final readback", async field => {
    const db = client({ ...protocol, [field]: "different-source" }, null, [protocol]);
    await expect(saveStudentLaborSafetyProtocol(input, db)).rejects.toThrow("Повторное чтение не подтвердило");
    expect(db.rpc).toHaveBeenCalledOnce();
  });
  it.each([true, false, 0, "", [], { ...protocol, source_user_id: null }, { ...protocol, version: "1" }, { ...protocol, updated_at: "invalid" }].map(value => ({ value })))("rejects malformed single response %#", async ({ value }) => {
    await expect(fetchStudentLaborSafetyProtocol(input, client(value))).rejects.toThrow();
  });
  it.each([true, {}, null, ""].map(value => ({ value })))("rejects malformed list response %#", async ({ value }) => {
    const malformed = client(value);
    await expect(fetchStudentLaborSafetyProtocols({ organizationId: "org-1", enrollmentIds: ["enr-1"] }, malformed)).rejects.toThrow();
  });
  it.each([true, {}, null, [true], [{ ...protocol, is_passed: "true" }]].map(value => ({ value })))("rejects malformed RPC response %#", async ({ value }) => {
    await expect(saveStudentLaborSafetyProtocol(input, client(protocol, null, value))).rejects.toThrow();
  });
  it("scopes a read to the exact organization and enrollment", async () => {
    const db = client();
    expect(await fetchStudentLaborSafetyProtocol(input, db as never)).toEqual(protocol);
    expect(db.eq).toEqual([["organization_id", "org-1"], ["enrollment_id", "enr-1"]]);
  });

  it("saves an explicit failed result and confirms the exact version with a separate read", async () => {
    const db = client();
    expect(await saveStudentLaborSafetyProtocol(input, db as never)).toEqual(protocol);
    expect(db.rpc).toHaveBeenCalledWith("save_labor_safety_enrollment_protocol", {
      p_organization_id: "org-1", p_enrollment_id: "enr-1", p_protocol_number: "ОТ-7",
      p_knowledge_check_date: "2026-09-01", p_is_passed: false, p_expected_version: null,
    });
    expect(db.from).toHaveBeenCalledWith("labor_safety_enrollment_protocols");
  });

  it("does not report success when read-back is absent or different", async () => {
    await expect(saveStudentLaborSafetyProtocol(input, client(null) as never)).rejects.toThrow("Повторное чтение не подтвердило");
    await expect(saveStudentLaborSafetyProtocol(input, client({ ...protocol, is_passed: true }) as never)).rejects.toThrow("Повторное чтение не подтвердило");
    await expect(saveStudentLaborSafetyProtocol(input, client({ ...protocol, version: 2 }) as never)).rejects.toThrow("Повторное чтение не подтвердило");
  });

  it("uses compare-and-set for updates and refuses an unexpected returned version", async () => {
    const next = { ...protocol, version: 3 };
    const db = client(next, null, [next]);
    await saveStudentLaborSafetyProtocol({ ...input, expectedVersion: 2 }, db as never);
    expect(db.rpc.mock.calls[0][1]).toMatchObject({ p_expected_version: 2 });
    await expect(saveStudentLaborSafetyProtocol({ ...input, expectedVersion: 2 }, client() as never)).rejects.toThrow("Ответ базы не совпал");
  });

  it("does not invent a date or result and validates before issuing a write", async () => {
    const db = client();
    await expect(saveStudentLaborSafetyProtocol({ ...input, knowledgeCheckDate: "" }, db as never)).rejects.toThrow("дату");
    await expect(saveStudentLaborSafetyProtocol({ ...input, isPassed: null as unknown as boolean }, db as never)).rejects.toThrow("результат");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("gives a migration-unavailable message for missing table or RPC", async () => {
    await expect(fetchStudentLaborSafetyProtocol(input, client(null, { code: "PGRST205" }) as never)).rejects.toThrow("обновление базы ещё не установлено");
    await expect(saveStudentLaborSafetyProtocol(input, client(null, null, null, { code: "PGRST202" }) as never)).rejects.toThrow("обновление базы ещё не установлено");
  });

  it("rejects foreign-tenant and duplicate rows in the batch read", async () => {
    await expect(fetchStudentLaborSafetyProtocols({ organizationId: "org-1", enrollmentIds: ["enr-1"] },
      client([{ ...protocol, organization_id: "org-2" }]) as never)).rejects.toThrow("неподтверждённые");
    await expect(fetchStudentLaborSafetyProtocols({ organizationId: "org-1", enrollmentIds: ["enr-1"] },
      client([protocol, protocol]) as never)).rejects.toThrow("несколько протоколов");
  });
});
