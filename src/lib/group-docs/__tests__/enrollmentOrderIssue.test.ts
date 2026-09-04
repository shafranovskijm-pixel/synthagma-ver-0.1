import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import JSZip from "jszip";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ENROLLMENT_ORDER_REVISION, ENROLLMENT_ORDER_TEMPLATE_SHA256, GORELTECH_ORGANIZATION_ID,
  compileEnrollmentOrderDocumentXml, enrollmentOrderEligibility, enrollmentOrderFilePath, enrollmentOrderSha256,
  handleEnrollmentOrderAction, readEnrollmentOrderRecord,
  type EnrollmentOrderPorts, type EnrollmentOrderRecord, type EnrollmentOrderSnapshot,
} from "../../../../supabase/functions/_shared/docx-ooxml/enrollmentOrderIssue";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/embedded";
import { type GroupDocumentManifest } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocument";
import { findUnresolvedTokens } from "../../../../supabase/functions/_shared/docx-ooxml/xml";

beforeAll(() => { vi.stubGlobal("crypto", webcrypto); });
const ACTOR = "00000000-0000-4000-8000-000000000001";
const GROUP = "00000000-0000-4000-8000-000000000002";
const COURSE = "00000000-0000-4000-8000-000000000003";
const STUDENT = "00000000-0000-4000-8000-000000000004";
const ENROLLMENT = "00000000-0000-4000-8000-000000000005";
const OPERATION = "00000000-0000-4000-8000-000000000006";
const FOREIGN = "00000000-0000-4000-8000-000000000099";
const SCOPE = { actorId: ACTOR, organizationId: GORELTECH_ORGANIZATION_ID, groupId: GROUP };
const BASE = { organizationId: SCOPE.organizationId, groupId: GROUP };
function snapshot(): EnrollmentOrderSnapshot {
  return {
    organization: { id: SCOPE.organizationId, name: "ООО «ИЦ «ГОРЭЛТЕХ»", inn: "7806541216", kpp: null, ogrn: null, legal_address: null },
    group: { id: GROUP, organization_id: SCOPE.organizationId, course_id: COURSE, group_number: "1-ПК-26", program_title: "Программа <А> & Б", program_hours: 40, start_date: "2026-09-01", end_date: "2026-09-30" },
    course: { id: COURSE, organization_id: SCOPE.organizationId, title: "Курс <А> & Б", duration: "40", frdo_duration_hours: 40 },
    profiles: [{ user_id: STUDENT, organization_id: SCOPE.organizationId, student_group_id: GROUP, archived_at: null, full_name: "Иванов Иван Иванович", email: null }],
    enrollments: [{ id: ENROLLMENT, user_id: STUDENT, course_id: COURSE, status: "active", progress: 0, completed_at: null }],
    studentFrdoData: [],
    metadata: { clientResponsiblePersonName: "Ляпко Дарья Константиновна", clientOrganizationShortName: "ООО «ИЦ «ГОРЭЛТЕХ»", responsiblePersonSource: "goreltech-client-template-v20", documentStage: "enrollment_prepared_unsigned" },
  };
}
async function frozen(source = snapshot()) {
  // Whitespace resembles JSONB serialization: SHA is verified over the exact returned text.
  const snapshotCanonical = JSON.stringify(source, null, 1);
  return { ...SCOPE, snapshot: source, snapshotCanonical, snapshotHash: await enrollmentOrderSha256(snapshotCanonical) };
}
async function record(source = snapshot()): Promise<EnrollmentOrderRecord> {
  return { ...await frozen(source), operationId: OPERATION, status: "reserved", documentNumber: "УЦ-1/2026", documentDate: "2026-09-04",
    signatory: { position: "Руководитель учебного центра", name: "Петров Пётр Петрович" }, templateSha256: ENROLLMENT_ORDER_TEMPLATE_SHA256, filePath: null, docxSha256: null };
}
async function completed(source = snapshot()) {
  const result = await record(source);
  result.status = "completed";
  result.docxSha256 = await enrollmentOrderSha256("word bytes");
  result.filePath = enrollmentOrderFilePath(SCOPE, OPERATION, result.docxSha256);
  return result;
}
async function fixture(initial: EnrollmentOrderRecord | null = null) {
  const reserved = await record();
  let saved = initial;
  const bytes = new TextEncoder().encode("word bytes");
  const files = new Map<string, Uint8Array>();
  const ports: EnrollmentOrderPorts = {
    rpc: vi.fn(async (name, args) => {
      expect(args.p_actor_id).toBe(ACTOR);
      expect(args.p_organization_id).toBe(SCOPE.organizationId);
      expect(args.p_group_id).toBe(GROUP);
      if (name === "preview_goreltech_enrollment_order") return frozen();
      if (name === "get_goreltech_enrollment_order") return saved;
      if (name === "list_goreltech_enrollment_orders") return saved?.status === "completed" ? [saved] : [];
      if (name === "reserve_goreltech_enrollment_order") { saved = structuredClone(reserved); return saved; }
      if (name === "complete_goreltech_enrollment_order") {
        saved = { ...saved!, status: "completed", filePath: args.p_file_path as string, docxSha256: args.p_docx_sha256 as string };
        return saved;
      }
      throw new Error("unexpected RPC");
    }),
    compile: vi.fn(async () => bytes),
    upload: vi.fn(async (path, data) => { if (files.has(path)) throw new Error("already exists"); files.set(path, data); }),
    download: vi.fn(async (path) => { const data = files.get(path); if (!data) throw new Error("missing"); return data; }),
    signedUrl: vi.fn(async (path) => `https://example.invalid/signed/${path}`),
  };
  return { ports, bytes, files, reserved,
    body: { ...BASE, action: "finalize", operationId: OPERATION, expectedSnapshotHash: reserved.snapshotHash, documentDate: reserved.documentDate, signatory: reserved.signatory, confirmed: true },
  };
}

describe("prepared unsigned enrollment order from frozen DB facts", () => {
  it("allows the start of training without completion, instructor, grades, certificates or FRDO", () => {
    expect(enrollmentOrderEligibility(snapshot())).toEqual({ issues: [], canFinalize: true });
  });
  it("retains nullable legacy progress without fabricating zero or requiring release data", async () => {
    const source = snapshot(); source.enrollments[0].progress = null;
    const saved = await readEnrollmentOrderRecord(await record(source), SCOPE, OPERATION);
    expect(saved.snapshot.enrollments[0].progress).toBeNull();
    expect(enrollmentOrderEligibility(saved.snapshot).canFinalize).toBe(true);
  });
  it.each([
    ["missing_enrollment", (s: EnrollmentOrderSnapshot) => { s.enrollments = []; }],
    ["missing_student_name", (s: EnrollmentOrderSnapshot) => { s.profiles[0].full_name = ""; }],
    ["empty_group", (s: EnrollmentOrderSnapshot) => { s.profiles = []; }],
    ["invalid_group_period", (s: EnrollmentOrderSnapshot) => { s.group.end_date = "2026-08-01"; }],
    ["ambiguous_enrollment", (s: EnrollmentOrderSnapshot) => { s.enrollments = [...s.enrollments, { ...s.enrollments[0], id: FOREIGN }]; }],
    ["program_hours_conflict", (s: EnrollmentOrderSnapshot) => { s.course!.duration = "72"; }],
    ["program_hours_conflict", (s: EnrollmentOrderSnapshot) => { s.group.program_hours = -1; }],
    ["profile_scope_mismatch", (s: EnrollmentOrderSnapshot) => { s.profiles[0].organization_id = FOREIGN; }],
  ] as const)("blocks only the actual enrollment prerequisite: %s", (code, mutate) => {
    const source = snapshot(); mutate(source);
    const result = enrollmentOrderEligibility(source);
    expect(result.canFinalize).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code }));
  });
  it.each(["\u0000", "\u000b", "\u001f", "\ufffe", "\uffff", "\ud800", "\udc00"])("rejects invalid XML text without echoing or silently stripping the saved value", (invalid) => {
    const source = snapshot(); source.profiles[0].full_name = `Sensitive${invalid}`;
    const result = enrollmentOrderEligibility(source);
    expect(result.canFinalize).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "invalid_xml_text", field: "profiles[0].full_name" }));
    expect(JSON.stringify(result.issues)).not.toContain("Sensitive");
    expect(source.profiles[0].full_name).toBe(`Sensitive${invalid}`);
  });
  it("accepts Cyrillic, escaping characters, tabs/newlines and non-BMP Unicode", () => {
    const source = snapshot(); source.group.program_title = "ОТ <А> & Б\t\n😀";
    expect(enrollmentOrderEligibility(source).canFinalize).toBe(true);
  });
  it("preview is readonly, validates canonical hash, and never receives browser HTML as facts", async () => {
    const { ports } = await fixture();
    const result = await handleEnrollmentOrderAction({ ...BASE, action: "preview", html: "BROWSER_INJECTED", actorId: FOREIGN }, ACTOR, ports);
    expect(result).toMatchObject({ revision: ENROLLMENT_ORDER_REVISION, ...BASE, canFinalize: true, issues: [] });
    expect(ports.rpc).toHaveBeenCalledExactlyOnceWith("preview_goreltech_enrollment_order", { p_actor_id: ACTOR, p_organization_id: SCOPE.organizationId, p_group_id: GROUP });
    expect(ports.compile).not.toHaveBeenCalled(); expect(ports.upload).not.toHaveBeenCalled();
  });
  it("preview confirmation summary uses exact Word facts, including saved course fallbacks", async () => {
    const source = snapshot(); source.group.program_title = null; source.group.program_hours = null;
    const { ports } = await fixture(); vi.mocked(ports.rpc).mockResolvedValue(await frozen(source));
    const result = await handleEnrollmentOrderAction({ ...BASE, action: "preview" }, ACTOR, ports);
    expect(result).toMatchObject({ canFinalize: true, documentSummary: {
      groupNumber: "1-ПК-26", programTitle: "Курс <А> & Б", programHours: "40", startDate: "01.09.2026", endDate: "30.09.2026",
    } });
    const bundled = GROUP_DOCUMENT_TEMPLATE_BUNDLE.enrollment_order;
    const zip = await JSZip.loadAsync(Buffer.from(bundled.templateBase64, "base64"));
    const xml = compileEnrollmentOrderDocumentXml(await zip.file("word/document.xml")!.async("string"), JSON.parse(bundled.manifestJson), await record(source));
    expect(xml).toContain("Курс &lt;А&gt; &amp; Б");
    expect(xml).toContain("01.09.2026–30.09.2026");
  });
  it.each(["snapshot", "canonical", "hash", "actor", "group", "organization"])("rejects tampered %s before rendering", async (field) => {
    const source = await record();
    if (field === "snapshot") source.snapshot.group.group_number = "TAMPERED";
    if (field === "canonical") source.snapshotCanonical += " ";
    if (field === "hash") source.snapshotHash = "0".repeat(64);
    if (field === "actor") source.actorId = FOREIGN;
    if (field === "group") source.groupId = FOREIGN;
    if (field === "organization") source.organizationId = FOREIGN;
    await expect(readEnrollmentOrderRecord(source, SCOPE, OPERATION)).rejects.toThrow();
  });
  it("rejects wrong template, date, number year, file path and completed-without-file", async () => {
    const source = await completed();
    for (const patch of [{ templateSha256: "0".repeat(64) }, { documentDate: "2026-02-30" }, { documentNumber: "УЦ-1/2025" }, { filePath: "foreign.docx" }, { docxSha256: null }]) {
      await expect(readEnrollmentOrderRecord({ ...source, ...patch }, SCOPE, OPERATION)).rejects.toThrow();
    }
  });
  it("requires explicit confirmation and valid scope before performing a mutation", async () => {
    const { ports, body } = await fixture();
    for (const changed of [{ ...body, confirmed: false }, { ...body, organizationId: FOREIGN }, { ...body, operationId: "not uuid" }]) {
      await expect(handleEnrollmentOrderAction(changed, ACTOR, ports)).rejects.toThrow();
    }
    expect(ports.rpc).not.toHaveBeenCalled(); expect(ports.upload).not.toHaveBeenCalled();
  });
  it.each([{ documentDate: "2026-02-30" }, { signatory: { position: "", name: "Подписант" } }, { signatory: { position: "Начальник", name: "ФИО\u0000" } }])("checks new date/signatory before reserve: %j", async (patch) => {
    const { ports, body } = await fixture();
    await expect(handleEnrollmentOrderAction({ ...body, ...patch }, ACTOR, ports)).rejects.toThrow();
    expect(vi.mocked(ports.rpc).mock.calls.map(([name]) => name)).toEqual(["get_goreltech_enrollment_order"]);
  });
  it("reserves once, compiles frozen response only, uploads immutable path, and checks exact completion", async () => {
    const { ports, body, reserved, bytes } = await fixture();
    const result = await handleEnrollmentOrderAction({ ...body, snapshot: { html: "BROWSER_INJECTED" } }, ACTOR, ports);
    expect(ports.compile).toHaveBeenCalledExactlyOnceWith(reserved);
    expect(vi.mocked(ports.rpc).mock.calls.map(([name]) => name)).toEqual(["get_goreltech_enrollment_order", "reserve_goreltech_enrollment_order", "complete_goreltech_enrollment_order"]);
    expect(result).toMatchObject({ revision: ENROLLMENT_ORDER_REVISION, operation: { status: "completed", documentNumber: "УЦ-1/2026", operationId: OPERATION } });
    expect(JSON.stringify(result)).not.toContain("BROWSER_INJECTED");
    expect(ports.upload).toHaveBeenCalledWith(enrollmentOrderFilePath(SCOPE, OPERATION, await enrollmentOrderSha256(bytes)), bytes);
  });
  it("completed same UUID returns original intent even if a retry body changed", async () => {
    const source = await completed(); const { ports, body } = await fixture(source);
    const result = await handleEnrollmentOrderAction({ ...body, documentDate: "bad", signatory: null, expectedSnapshotHash: "changed" }, ACTOR, ports);
    expect(result.operation).toEqual(source);
    expect(ports.compile).not.toHaveBeenCalled(); expect(ports.upload).not.toHaveBeenCalled();
    expect(vi.mocked(ports.rpc).mock.calls.map(([name]) => name)).toEqual(["get_goreltech_enrollment_order"]);
  });
  it("a reserve response with a changed frozen intent cannot reach storage", async () => {
    const { ports, body, reserved } = await fixture();
    vi.mocked(ports.rpc).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...reserved, documentDate: "2026-09-05" });
    await expect(handleEnrollmentOrderAction(body, ACTOR, ports)).rejects.toMatchObject({ code: "reserved_intent_mismatch" });
    expect(ports.upload).not.toHaveBeenCalled();
  });
  it("status null is unknown, resume null never reserves or infers cancellation", async () => {
    const { ports } = await fixture();
    expect(await handleEnrollmentOrderAction({ ...BASE, action: "status", operationId: OPERATION }, ACTOR, ports)).toMatchObject({ operation: null });
    await expect(handleEnrollmentOrderAction({ ...BASE, action: "resume", operationId: OPERATION, confirmed: true }, ACTOR, ports)).rejects.toMatchObject({ code: "operation_unknown" });
    expect(vi.mocked(ports.rpc).mock.calls.every(([name]) => name === "get_goreltech_enrollment_order")).toBe(true);
    expect(ports.compile).not.toHaveBeenCalled();
  });
  it("resume uses the frozen record, not new prerequisites or browser date/signatory", async () => {
    const original = await record(); const { ports } = await fixture(original);
    await handleEnrollmentOrderAction({ ...BASE, action: "resume", operationId: OPERATION, confirmed: true, documentDate: "evil", signatory: { name: "evil" } }, ACTOR, ports);
    expect(ports.compile).toHaveBeenCalledWith(original);
    expect(vi.mocked(ports.rpc).mock.calls.map(([name]) => name)).toEqual(["get_goreltech_enrollment_order", "complete_goreltech_enrollment_order"]);
  });
  it("existing immutable file is reused only after its downloaded bytes hash matches", async () => {
    const { ports, body, files, bytes } = await fixture(await record());
    const path = enrollmentOrderFilePath(SCOPE, OPERATION, await enrollmentOrderSha256(bytes)); files.set(path, bytes);
    const result = await handleEnrollmentOrderAction(body, ACTOR, ports);
    expect(ports.download).toHaveBeenCalledExactlyOnceWith(path);
    expect(result).toMatchObject({ operation: { status: "completed", filePath: path } });
  });
  it("existing different bytes cause conflict; no overwrite, completion, or cleanup", async () => {
    const { ports, body, files, bytes } = await fixture(await record());
    files.set(enrollmentOrderFilePath(SCOPE, OPERATION, await enrollmentOrderSha256(bytes)), new TextEncoder().encode("wrong"));
    await expect(handleEnrollmentOrderAction(body, ACTOR, ports)).rejects.toMatchObject({ code: "immutable_file_conflict" });
    expect(vi.mocked(ports.rpc).mock.calls.map(([name]) => name)).toEqual(["get_goreltech_enrollment_order"]);
    expect(ports.upload).toHaveBeenCalledTimes(1);
  });
  it("lost upload response without readable object remains unknown, no automatic write retries", async () => {
    const { ports, body } = await fixture(await record());
    vi.mocked(ports.upload).mockRejectedValue(new Error("network"));
    await expect(handleEnrollmentOrderAction(body, ACTOR, ports)).rejects.toMatchObject({ code: "upload_outcome_unknown" });
    expect(ports.upload).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ports.rpc).mock.calls.map(([name]) => name)).toEqual(["get_goreltech_enrollment_order"]);
  });
  it("a lost completion response preserves the operation for explicit status/recovery", async () => {
    const { ports, body } = await fixture(await record());
    const original = ports.rpc;
    ports.rpc = vi.fn(async (name, args) => { if (name === "complete_goreltech_enrollment_order") throw new Error("lost completion"); return original(name, args); });
    await expect(handleEnrollmentOrderAction(body, ACTOR, ports)).rejects.toThrow("lost completion");
    expect(ports.upload).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ports.rpc).mock.calls.filter(([name]) => name === "complete_goreltech_enrollment_order")).toHaveLength(1);
  });
  it("rejects an incorrect completion response after upload instead of announcing success", async () => {
    const { ports, body } = await fixture(await record());
    const wrong = await completed(); wrong.documentNumber = "УЦ-2/2026";
    vi.mocked(ports.rpc).mockResolvedValueOnce(await record()).mockResolvedValueOnce(wrong);
    await expect(handleEnrollmentOrderAction(body, ACTOR, ports)).rejects.toMatchObject({ code: "completion_unconfirmed" });
  });
  it("organization read lists another creator's completed record and downloads only ledger-matched path", async () => {
    const other = await completed(); other.actorId = FOREIGN;
    const { ports } = await fixture(other);
    const listed = await handleEnrollmentOrderAction({ ...BASE, action: "list" }, ACTOR, ports);
    expect(listed.operations).toEqual([other]);
    await handleEnrollmentOrderAction({ ...BASE, action: "download", operationId: OPERATION, filePath: "ATTACKER_PATH" }, ACTOR, ports);
    expect(ports.signedUrl).toHaveBeenCalledExactlyOnceWith(other.filePath);
    expect(vi.mocked(ports.rpc).mock.calls.every(([name]) => name === "list_goreltech_enrollment_orders")).toBe(true);
    await expect(handleEnrollmentOrderAction({ ...BASE, action: "resume", operationId: OPERATION, confirmed: true }, ACTOR, ports)).rejects.toMatchObject({ code: "record_scope_mismatch" });
  });
  it.each(["foreign_group", "reserved", "duplicate", "null"])("fails closed on invalid completed list: %s", async (kind) => {
    const source = await completed(), { ports } = await fixture();
    const raw = kind === "foreign_group" ? [{ ...source, groupId: FOREIGN }] : kind === "reserved" ? [await record()] : kind === "duplicate" ? [source, source] : null;
    vi.mocked(ports.rpc).mockResolvedValue(raw);
    await expect(handleEnrollmentOrderAction({ ...BASE, action: "download", operationId: OPERATION }, ACTOR, ports)).rejects.toThrow();
    expect(ports.signedUrl).not.toHaveBeenCalled();
  });
  it("never turns a permission failure into an admin table fallback", async () => {
    const { ports } = await fixture(); vi.mocked(ports.rpc).mockRejectedValue(new Error("permission denied"));
    await expect(handleEnrollmentOrderAction({ ...BASE, action: "preview" }, ACTOR, ports)).rejects.toThrow("permission denied");
    expect(ports.rpc).toHaveBeenCalledTimes(1); expect(ports.compile).not.toHaveBeenCalled();
  });
});

describe("retained original Word package and Edge security boundary", () => {
  it("fills only enrollment order main XML, preserves every other ZIP part, header, orientation, blank basis and deterministic bytes", async () => {
    const bundled = GROUP_DOCUMENT_TEMPLATE_BUNDLE.enrollment_order;
    const manifest = JSON.parse(bundled.manifestJson) as GroupDocumentManifest;
    const sourceBytes = Buffer.from(bundled.templateBase64, "base64");
    expect(await enrollmentOrderSha256(sourceBytes)).toBe(ENROLLMENT_ORDER_TEMPLATE_SHA256);
    expect(sourceBytes).toEqual(readFileSync("supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/templates/enrollment_order.docx"));
    const source = await JSZip.loadAsync(sourceBytes), originalXml = await source.file("word/document.xml")!.async("string");
    const saved = await record();
    const outputXml = compileEnrollmentOrderDocumentXml(originalXml, manifest, saved);
    expect(outputXml).toContain("Иванов Иван Иванович"); expect(outputXml).toContain("Программа &lt;А&gt; &amp; Б");
    expect(outputXml).toContain("УЦ-1/2026"); expect(outputXml).toContain("04.09.2026");
    expect(outputXml).toContain("Руководитель учебного центра"); expect(outputXml).toContain("Петров П.П.");
    expect(outputXml).toContain("Ляпко Дарья Константиновна"); expect(findUnresolvedTokens(outputXml)).toEqual([]);
    expect(outputXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)).toEqual(originalXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
    const xml = new DOMParser().parseFromString(outputXml, "application/xml"); expect(xml.getElementsByTagName("parsererror")).toHaveLength(0);
    const row = xml.getElementsByTagName("w:tbl")[0].getElementsByTagName("w:tr")[2];
    expect(Array.from(row.getElementsByTagName("w:tc")).at(-1)!.textContent).toBe("");
    const generate = async () => {
      const zip = await JSZip.loadAsync(sourceBytes), document = zip.file("word/document.xml")!;
      zip.file("word/document.xml", outputXml, { date: document.date, createFolders: false });
      return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    };
    const bytes = await generate(), repeat = await generate(); expect(bytes).toEqual(repeat);
    const result = await JSZip.loadAsync(bytes);
    expect(Object.keys(result.files).sort()).toEqual(Object.keys(source.files).sort());
    for (const [path, entry] of Object.entries(source.files)) if (!entry.dir && path !== "word/document.xml") {
      expect(await result.file(path)!.async("uint8array"), path).toEqual(await entry.async("uint8array"));
    }
  }, 15_000);
  it("uses frozen client responsibility metadata, not current compiler defaults", async () => {
    const bundled = GROUP_DOCUMENT_TEMPLATE_BUNDLE.enrollment_order;
    const zip = await JSZip.loadAsync(Buffer.from(bundled.templateBase64, "base64"));
    const source = snapshot(); source.metadata.clientResponsiblePersonName = "Сохранённое ответственное лицо";
    const result = compileEnrollmentOrderDocumentXml(await zip.file("word/document.xml")!.async("string"), JSON.parse(bundled.manifestJson), await record(source));
    expect(result).toContain("Сохранённое ответственное лицо"); expect(result).not.toContain("Ляпко Дарья Константиновна");
  });
  it("Edge authenticates JWT actor, uses service-only RPC, private immutable storage, no existing batch writes", () => {
    const source = readFileSync("supabase/functions/issue-group-enrollment-order/index.ts", "utf8");
    expect(source).toContain("userClient.auth.getUser()"); expect(source).toContain("handleEnrollmentOrderAction(body, auth.user.id");
    expect(source).toContain("admin.rpc(name, args)"); expect(source).toContain("upsert: false"); expect(source).toContain("createSignedUrl(path, 300)");
    expect(source).toContain("ENROLLMENT_ORDER_TEMPLATE_SHA256"); expect(source).toContain("date: document.date");
    expect(source).not.toMatch(/\.from\(["'](?:group_documents|profiles|enrollments)["']\)|\.remove\(|upsert: true|create_goreltech_group_document_batch/);
  });
});
