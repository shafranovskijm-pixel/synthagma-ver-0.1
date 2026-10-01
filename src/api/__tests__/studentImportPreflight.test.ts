import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke } } }));
import { assertStudentImportBackendRevision, checkStudentImportRows } from "../studentImportPreflight";
import { parseRows } from "@/utils/studentsExcelImport";

describe("import server preflight", () => {
  beforeEach(() => { rpc.mockReset(); invoke.mockReset(); });
  it("sends no password and refuses an incomplete server answer", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const rows = parseRows(["ФИО","Логин","Пароль"],[["Иван Иванов","qa-login","private-password"]]).rows;
    await expect(checkStudentImportRows("org", rows)).rejects.toThrow("всех строк");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("private-password");
  });
  it("fails closed on permission/network failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(checkStudentImportRows("org", parseRows(["ФИО"],[["Иван"]]).rows)).rejects.toThrow("permission denied");
  });
  it("matches answers by row identity and tolerates server ordering", async () => {
    rpc.mockResolvedValue({ data: [{ row_index: 2, login_taken: true, name_matches: 0, email_matches: 0 }, { row_index: 1, login_taken: false, name_matches: 1, email_matches: 0 }], error: null });
    const checks = await checkStudentImportRows("org", parseRows(["ФИО","Логин"],[["Иван","one"],["Пётр","two"]]).rows);
    expect(checks[0].blocked).toEqual([]); expect(checks[1].blocked.length).toBe(1);
  });
});

describe("import registration deployment gate", () => {
  beforeEach(() => invoke.mockReset());
  const probeResponse = (revision?: string, status = 400) => {
    const response = new Response('{"error":"invalid request"}', {
      status,
      headers: revision ? { "X-Sintagma-Register-Student-Revision": revision } : {},
    });
    return { data: null, error: new FunctionsHttpError(response), response };
  };

  it.each(["student-import-v5", undefined])("rejects old or missing revision %s", async revision => {
    invoke.mockResolvedValue(probeResponse(revision));
    await expect(assertStudentImportBackendRevision()).rejects.toThrow("защиту от дублей");
  });

  it("accepts the v6 validation response using a bodyless SDK GET", async () => {
    invoke.mockResolvedValue(probeResponse("student-import-v6"));
    await expect(assertStudentImportBackendRevision()).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("register-student", { method: "GET", timeout: 10000 });
  });

  it("rejects a gateway failure even if its header claims v6", async () => {
    invoke.mockResolvedValue(probeResponse("student-import-v6", 502));
    await expect(assertStudentImportBackendRevision()).rejects.toThrow("защиту от дублей");
  });

  it("rejects network failures and unexpected successful probe responses", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("network failure") });
    await expect(assertStudentImportBackendRevision()).rejects.toThrow("защиту от дублей");
    invoke.mockResolvedValueOnce({ data: {}, error: null, response: new Response("{}", {
      headers: { "X-Sintagma-Register-Student-Revision": "student-import-v6" },
    }) });
    await expect(assertStudentImportBackendRevision()).rejects.toThrow("защиту от дублей");
  });
});
