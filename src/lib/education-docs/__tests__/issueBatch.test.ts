import { describe, it, expect, vi } from "vitest";
import {
  buildIssueBatchPayload,
  issueEducationDocumentBatch,
  issueEducationDocumentsByCourse,
  issuedRowKey,
} from "../issueBatch";

const item = (over: Partial<any> = {}) => ({
  user_id: "u1",
  enrollment_id: "e1",
  document_type: "certificate",
  full_name: "Иванов Иван",
  specialty_name: "Курс",
  ...over,
});

describe("buildIssueBatchPayload", () => {
  it("passes exact group/course and normalizes empties to null", () => {
    const p = buildIssueBatchPayload({
      organizationId: "org1",
      groupId: "g1",
      courseId: "c1",
      items: [item({ qualification_name: "", birth_date: "" })],
    });
    expect(p.p_group_id).toBe("g1");
    expect(p.p_course_id).toBe("c1");
    expect(p.p_items[0].qualification_name).toBeNull();
    expect(p.p_items[0].birth_date).toBeNull();
    // локальная дата, а не UTC-строка
    expect(p.p_items[0].issue_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects items without user_id and empty batches", () => {
    expect(() => buildIssueBatchPayload({ organizationId: "org1", items: [] })).toThrow();
    expect(() =>
      buildIssueBatchPayload({ organizationId: "org1", items: [item({ user_id: "" })] }),
    ).toThrow(/user_id/);
  });
});

describe("issueEducationDocumentBatch", () => {
  it("never falls back to client numbering — throws on RPC error", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "wrong group" } }) };
    await expect(
      issueEducationDocumentBatch({ organizationId: "org1", groupId: "g1", items: [item()] }, client),
    ).rejects.toThrow(/wrong group/);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns server-issued rows with server numbers", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ user_id: "u1", enrollment_id: "e1", document_number: "2026-001", reg_number: "1" }],
        error: null,
      }),
    };
    const rows = await issueEducationDocumentBatch({ organizationId: "org1", items: [item()] }, client);
    expect(rows[0].document_number).toBe("2026-001");
    expect(issuedRowKey(rows[0])).toBe("u1|e1");
  });

  it("serializes concurrent batches (unique numbers per call)", async () => {
    let n = 0;
    const client = {
      rpc: vi.fn().mockImplementation(async () => {
        n += 1;
        return { data: [{ user_id: "u1", enrollment_id: `e${n}`, document_number: `2026-00${n}`, reg_number: `${n}` }], error: null };
      }),
    };
    const [a, b] = await Promise.all([
      issueEducationDocumentBatch({ organizationId: "org1", items: [item()] }, client),
      issueEducationDocumentBatch({ organizationId: "org1", items: [item({ enrollment_id: "e2" })] }, client),
    ]);
    expect(a[0].document_number).not.toBe(b[0].document_number);
  });
});

describe("issueEducationDocumentsByCourse", () => {
  it("issues one atomic batch per exact course_id", async () => {
    const calls: any[] = [];
    const client = {
      rpc: vi.fn().mockImplementation(async (_fn: string, params: any) => {
        calls.push(params);
        return { data: params.p_items.map((i: any) => ({ ...i, document_number: "X", reg_number: "1" })), error: null };
      }),
    };
    const rows = await issueEducationDocumentsByCourse(
      {
        organizationId: "org1",
        groupId: "g1",
        items: [item({ course_id: "c1" }), item({ user_id: "u2", enrollment_id: "e2", course_id: "c2" })],
      },
      client,
    );
    expect(calls.map((c) => c.p_course_id).sort()).toEqual(["c1", "c2"]);
    expect(calls.every((c) => c.p_group_id === "g1")).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("aborts and reports progress when a batch fails (no silent partial success)", async () => {
    let first = true;
    const client = {
      rpc: vi.fn().mockImplementation(async (_fn: string, params: any) => {
        if (first) { first = false; return { data: params.p_items, error: null }; }
        return { data: null, error: { message: "student not in group" } };
      }),
    };
    await expect(
      issueEducationDocumentsByCourse(
        { organizationId: "org1", items: [item({ course_id: "c1" }), item({ course_id: "c2" })] },
        client,
      ),
    ).rejects.toThrow(/student not in group.*выдано партий: 1 из 2/);
  });
});
