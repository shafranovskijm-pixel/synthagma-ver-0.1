// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { prepareSelfExaminationVersion, saveSelfExaminationVersion } from "./self-examination-version";

const org = "00000000-0000-4000-8000-000000000001";
const doc = "00000000-0000-4000-8000-000000000002";
const request = "00000000-0000-4000-8000-000000000003";
function fixture(options: { oldSchema?: boolean; duplicate?: boolean; uploadError?: boolean; commitError?: boolean; replay?: boolean; wrongReplay?: boolean } = {}) {
  const upload = vi.fn(async () => ({ error: options.uploadError ? {} : null }));
  const remove = vi.fn(); const update = vi.fn(); const insert = vi.fn();
  const rpc = vi.fn(async () => ({ data: options.commitError ? null : { version_id: "version-new" }, error: options.commitError ? {} : null }));
  const from = vi.fn((table: string) => {
    const q = { select: vi.fn(() => q), eq: vi.fn(() => q), is: vi.fn(() => q), update, insert,
      maybeSingle: vi.fn(async () => table === "org_documents"
        ? { data: { id: doc, document_revision: 8 }, error: options.duplicate ? {} : null }
        : { data: options.replay ? { document_id: doc, file_url: "https://saved.invalid/report",
          document_metadata: { type: options.wrongReplay ? "license" : "self_examination_report" },
          request_payload: { upload: { change_summary: "Самообследование: ручное формирование" } } } : null,
          error: options.oldSchema ? {} : null }),
      single: vi.fn(async () => ({ data: { file_url: "https://saved.invalid/report" }, error: null })) };
    return q;
  });
  const db = { from, rpc, auth: {} as any, storage: { from: vi.fn(() => ({ upload, remove })) } };
  return { db, upload, remove, update, insert, rpc };
}
describe("self-examination version persistence", () => {
  it.each([{ oldSchema: true }, { duplicate: true }])("fails before upload for an unreadable schema or ambiguous document: %j", async options => {
    const f = fixture(options);
    await expect(prepareSelfExaminationVersion(f.db, org, request, null)).rejects.toHaveProperty("status");
    expect(f.upload).not.toHaveBeenCalled(); expect(f.update).not.toHaveBeenCalled();
  });
  it("uses the observed revision and atomic RPC without updating the previous file", async () => {
    const f = fixture(); const op = await prepareSelfExaminationVersion(f.db, org, request, null);
    await expect(saveSelfExaminationVersion(f.db, org, op, "<p>Отчёт</p>", 2026)).resolves.toBe("https://saved.invalid/report");
    expect(f.upload).toHaveBeenCalledWith(`${org}/versions/${doc}/${request}.html`, expect.any(Blob), { contentType: "text/html", upsert: false });
    expect(f.rpc).toHaveBeenCalledWith("commit_org_document_version", expect.objectContaining({
      p_document_id: doc, p_expected_revision: 8, p_request_id: request,
      p_upload: expect.objectContaining({ file_size: new Blob(["<p>Отчёт</p>"]).size }),
    }));
    expect(f.update).not.toHaveBeenCalled(); expect(f.insert).not.toHaveBeenCalled(); expect(f.remove).not.toHaveBeenCalled();
  });
  it("does not commit or remove files after a failed upload", async () => {
    const f = fixture({ uploadError: true }); const op = await prepareSelfExaminationVersion(f.db, org, request, null);
    await expect(saveSelfExaminationVersion(f.db, org, op, "report", 2026)).rejects.toHaveProperty("status", 409);
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.remove).not.toHaveBeenCalled();
  });
  it("retains the staged file on an uncertain commit instead of deleting a possibly committed version", async () => {
    const f = fixture({ commitError: true }); const op = await prepareSelfExaminationVersion(f.db, org, request, null);
    await expect(saveSelfExaminationVersion(f.db, org, op, "report", 2026)).rejects.toThrow(request);
    expect(f.remove).not.toHaveBeenCalled(); expect(f.update).not.toHaveBeenCalled();
  });
  it("replays a saved request without uploading or generating again", async () => {
    const f = fixture({ replay: true });
    expect(await prepareSelfExaminationVersion(f.db, org, request, null)).toMatchObject({ documentId: doc, replayUrl: "https://saved.invalid/report" });
    expect(f.upload).not.toHaveBeenCalled(); expect(f.db.from).not.toHaveBeenCalledWith("org_documents");
  });
  it("rejects reuse of a request belonging to another document", async () => {
    const f = fixture({ replay: true, wrongReplay: true });
    await expect(prepareSelfExaminationVersion(f.db, org, request, null)).rejects.toHaveProperty("status", 409);
    expect(f.upload).not.toHaveBeenCalled();
  });
});
