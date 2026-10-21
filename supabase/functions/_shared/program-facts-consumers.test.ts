// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import JSZip from "jszip";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import * as access from "./privileged-access";
import { requireDocumentWrite } from "./document-operation-access";
import * as programFacts from "./program-facts";
import * as educationArtifacts from "./group-education-artifact";
import * as contractCompiler from "./docx-ooxml/compile";
import * as contractRelations from "./docx-ooxml/relational";
import * as journalCompiler from "./docx-ooxml/classJournal";
import * as groupCompiler from "./docx-ooxml/groupDocument";
import * as money from "./docx-ooxml/money";
import { sha256CanonicalJson } from "./docx-ooxml/idempotency";
import * as contractTemplate from "./contract-templates/goreltech/company/v1/embedded";
import * as journalTemplate from "./group-doc-templates/goreltech/class-journal/v1/embedded";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "./group-doc-templates/goreltech/group-package/v1/embedded";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = "7237f9d4-3670-4a19-8946-a43c68fd3473", group = id(1), course = id(2), actor = id(3), learner = id(4), company = id(5);
const title = "Техническое обслуживание, монтаж, эксплуатация и ремонт взрывозащищенного электрооборудования";
const manifest = JSON.parse(contractTemplate.GORELTECH_COMPANY_CONTRACT_MANIFEST_JSON);
const packageTypes = ["enrollment_order", "expulsion_order", "student_list", "schedule", "attestation_sheet", "registration_book", "title_page", "pass"];
function envelope() {
  return { state: "confirmed", reason: null, group_id: group, course_id: course, enrollment_id: null, revision: 1,
    binding: { id: id(6), organization_id: org, group_id: group, course_id: course, revision: 1, version_id: id(7), program_id: id(8), snapshot_hash: "a".repeat(64),
      group_snapshot: { name: "Pinned QA group v1", start_date: "2026-09-01", end_date: "2026-09-04", training_dates: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"], schedule_text: "Pinned 10:00–18:00", instructor_name: "Pinned QA teacher" },
      program_snapshot: { id: id(7), organization_id: org, program_id: id(8), state: "approved", approved_at: "2026-10-18T12:00:00Z", approved_by: actor,
        file_document_id: id(9), file_version_id: id(10), file_review_id: id(11), facts_hash: "b".repeat(64),
        file_approval: { number: "QA review", date: "2026-10-18", recorded_by: actor },
        facts: { schema_version: 1, full_title: title, program_type: "dpo_upskilling", academic_hours: 32, training_form: "mixed",
          duration_calendar: "4 days", attestation_form: "test", attestation_criteria: "explicit criteria" } } },
    enrollments: [{ enrollment_id: id(12), user_id: learner, snapshot_id: id(13), state: "confirmed" }] };
}
function actualHandler(name: string, options: { unconfirmed?: boolean; rejectCommit?: boolean } = {}) {
  const uploads: { path: string; bytes: Uint8Array }[] = [], inserts: any[] = [];
  const upload = vi.fn(async (path: string, bytes: Uint8Array) => { uploads.push({ path, bytes }); return { error: null }; });
  const remove = vi.fn(async () => ({ error: null }));
  const profile = { user_id: learner, organization_id: org, student_group_id: group, full_name: "QA learner" };
  const query = (table: string) => {
    const rows: Record<string, any> = {
      organizations: { id: org, name: "ГОРЭЛТЕХ QA", inn: "7806541216", director_name: "QA Director", director_position: "Director" },
      student_groups: { id: group, organization_id: org, course_id: course, name: "QA group", group_number: "QA-1", program_title: "LIVE course v2", program_hours: 999,
        instructor_name: "QA Teacher", training_dates: ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"], start_date: "2026-10-18", end_date: "2026-10-21" },
      courses: { id: course, organization_id: org, title: "LIVE course v2", duration: "999 hours", frdo_duration_hours: 999 },
      companies: { id: company, organization_id: org },
      contract_template_registry: { template_key: manifest.template_id, version_label: manifest.template_version, template_sha256: manifest.template_sha256,
        counterparty_type: "legal", status: "active", manifest },
      student_frdo_data: [], group_documents: [],
    };
    let insert: any;
    const result = () => ({ data: rows[table] ?? null, error: null });
    const q: any = { select: () => q, eq: () => q, in: () => q, maybeSingle: async () => result(),
      insert: (row: any) => { insert = row; inserts.push(row); return q; },
      single: async () => ({ data: options.rejectCommit ? null : { ...insert, id: insert?.id ?? id(90) }, error: options.rejectCommit ? { message: "program_document_proof_mismatch_refresh", code: "40001" } : null }),
      then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject) };
    return q;
  };
  const rpc = vi.fn(async (name: string, args: any) => {
    if (name === "uc_document_action_allowed") return { data: true, error: null };
    if (name === "get_group_program_facts") return { data: options.unconfirmed
      ? { state: "unconfirmed", reason: "no_confirmed_group_binding", group_id: group, course_id: course, enrollment_id: null, revision: 0, binding: null, enrollments: [] }
      : envelope(), error: null };
    if (name === "register_goreltech_group_document_stage") return { data: { payload_sha256: "c".repeat(64) }, error: null };
    if (name === "create_goreltech_group_document_batch") {
      inserts.push(...args.p_docs);
      return { data: options.rejectCommit ? null : { batch_id: id(90), batch_version: 1, inserted_count: args.p_docs.length },
        error: options.rejectCommit ? { message: "program_document_proof_mismatch_refresh", code: "40001" } : null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const db = { auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) }, from: query, rpc, storage: { from: () => ({ upload, remove }) } };
  let handler!: (req: Request) => Promise<Response>;
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8");
  const ast = ts.createSourceFile("handler.ts", source, ts.ScriptTarget.Latest, true);
  const ranges = ast.statements.flatMap(s => ts.isImportDeclaration(s) ? [{ start: s.getFullStart(), end: s.end }]
    : ts.canHaveModifiers(s) ? (ts.getModifiers(s) || []).filter(m => m.kind === ts.SyntaxKind.ExportKeyword).map(m => ({ start: m.getStart(ast), end: m.end })) : []);
  const stripped = ranges.sort((a, b) => b.start - a.start).reduce((s, r) => s.slice(0, r.start) + s.slice(r.end), source);
  const executable = ts.transpileModule(stripped, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const deps = { ...access, ...programFacts, ...educationArtifacts, ...contractCompiler, ...contractRelations, ...journalCompiler, ...groupCompiler, ...money,
    ...contractTemplate, ...journalTemplate, GROUP_DOCUMENT_TEMPLATE_BUNDLE, sha256CanonicalJson,
    requireDocumentWrite, z, JSZip, createClient: () => db, readEffectiveGroupProfiles: async () => ({ data: [profile], error: null }),
    corsHeaders: {}, console: { log() {}, warn() {}, error() {} },
    Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "synthetic-only" } } };
  new Function(...Object.keys(deps), executable)(...Object.values(deps));
  return { handler, uploads, upload, remove, inserts, rpc };
}
function request(name: string, extra: Record<string, any> = {}) {
  const scalars = Object.fromEntries(manifest.variables.filter((v: any) => !v.scope).map((v: any) => [v.token.slice(2, -2), "QA value"]));
  const body = name === "compile-docx-contract" ? { organizationId: org, groupId: group, templateKey: manifest.template_id, companyId: company,
    studentUserIds: [learner], studentsMeta: [{ user_id: learner, full_name: "QA learner" }], contractName: "QA contract", contractNumber: "QA-001", contractDate: "2026-10-18",
    totalAmount: 10, taxClauseExplicit: true, scalars,
    programs: [{ PROG_TITLE: "FORGED browser v3", PROG_FORM: "FORGED", PROG_COUNT: "999" }],
    students: [{ STUDENT_FIO: "QA learner", STUDENT_EDU: "QA education", STUDENT_CONTACTS: "qa@example.invalid", STUDENT_POSITION: "QA", STUDENT_ADDRESS: "QA address", STUDENT_PROGRAM: "FORGED browser v3", STUDENT_DATES: "2030-01-01" }], curricula: [title] }
    : { organizationId: org, groupId: group, studentUserIds: [learner], fillMode: "blank", otherDocuments: packageTypes.map(doc_type => {
      const m = JSON.parse(GROUP_DOCUMENT_TEMPLATE_BUNDLE[doc_type as keyof typeof GROUP_DOCUMENT_TEMPLATE_BUNDLE].manifestJson);
      const variables: Record<string, string> = { program_title: "FORGED browser v3", program_hours: "999", start_date: "2030-01-01", org_city: "QA city", year: "2026", contract_basis_line: "QA draft basis" };
      if (m.row_source_key) variables[m.row_source_key] = `<tr>${m.row_tokens.map((key: string) => `<td>${key === "STUDENT_NAME" ? "QA learner" : key === "N" ? "1" : "FORGED row v3"}</td>`).join("")}</tr>`;
      return { doc_type, name: `QA ${doc_type}`, variables, doc_status: "final", document_number: "MUST-NOT-ISSUE" };
    }) };
  return new Request("https://synthetic.invalid/function", { method: "POST", headers: { Authorization: "Bearer synthetic-user", "X-Sintagma-Required-Compiler-Revision": "goreltech-group-package-dry-run-v14" }, body: JSON.stringify({ ...body, ...extra }) });
}
describe("actual programme-consuming compilers", () => {
  it("DOCX contract overwrites caller facts with pinned v1 and persists the same proof after real compilation", async () => {
    const f = actualHandler("compile-docx-contract"); const res = await f.handler(request("compile-docx-contract"));
    expect(await res.clone().json()).not.toHaveProperty("error"); expect(res.status).toBe(200); expect(f.uploads).toHaveLength(1); expect(f.inserts).toHaveLength(1);
    const row = f.inserts[0]; expect(row.variables_snapshot).toMatchObject({ PROGRAM_HOURS: "32", programs: [{ PROG_TITLE: title, PROG_FORM: "Очно-заочная", PROG_COUNT: "1" }], students: [{ STUDENT_PROGRAM: title }], program_facts: { state: "confirmed", version_id: id(7), enrollment_snapshot_ids: [id(13)] } });
    expect(row.variables_snapshot.scalars).toMatchObject({SCHEDULE:"Pinned 10:00–18:00",START_DATE:"2026-09-01",END_DATE:"2026-09-04",ATTESTATION_FORM:"test"});
    expect(row.variables_snapshot.students[0].STUDENT_DATES).toBe("01.09.2026 — 04.09.2026");
    const xml = await (await JSZip.loadAsync(f.uploads[0].bytes)).file("word/document.xml")!.async("string");
    expect(xml).toContain(title); expect(xml).not.toContain("FORGED browser v3"); expect(xml).not.toContain("LIVE course v2");
  }, 30000);
  it("unconfirmed DOCX is explicitly an unnumbered draft, even when a previous client sends a number", async () => {
    const f = actualHandler("compile-docx-contract", { unconfirmed: true }); const body = await request("compile-docx-contract").json();
    body.students[0].STUDENT_PROGRAM = body.programs[0].PROG_TITLE;
    const res = await f.handler(request("compile-docx-contract", body)); expect(await res.clone().json()).not.toHaveProperty("error"); expect(res.status).toBe(200);
    expect(f.inserts[0]).toMatchObject({ status: "draft", contract_number: null, variables_snapshot: { scalars: { DOC_NO: "Черновик" }, program_facts: { state: "unconfirmed" } } });
  }, 30000);
  it.each(["blank", "data"])("%s: journal and all eight companion files share exact pinned title/hours/form/proof and stay draft", async fillMode => {
    const f = actualHandler("compile-group-class-journal"); const res = await f.handler(request("compile-group-class-journal", {fillMode}));
    expect(await res.clone().json()).not.toHaveProperty("error"); expect(res.status).toBe(200); expect(f.uploads).toHaveLength(9); expect(f.inserts).toHaveLength(9);
    for (const row of f.inserts) {
      expect(row).toMatchObject({ doc_status: "draft", document_number: null,
        variables_snapshot: { scalars: { PROGRAM_TITLE: title, PROGRAM_HOURS: "32", PROGRAM_FORM: "Очно-заочная" }, program_facts: { state: "confirmed", version_id: id(7), enrollment_snapshot_ids: [id(13)] } } });
      expect(row.variables_snapshot.scalars).toMatchObject({START_DATE:"2026-09-01",END_DATE:"2026-09-04",SCHEDULE:"Pinned 10:00–18:00"});
    }
    const enrollmentRow=f.inserts.find(row=>row.doc_type==="enrollment_order").variables_snapshot.rows[0];
    expect(enrollmentRow).toMatchObject({STUDENT_PROGRAM:title,STUDENT_HOURS:"32",STUDENT_PERIOD:"01.09.2026 — 04.09.2026"});
    expect(f.inserts.find(row=>row.doc_type==="registration_book").variables_snapshot.rows[0].PROGRAM_GROUP).toContain("Pinned QA group v1");
    expect(f.inserts.find(row=>row.doc_type==="class_journal").variables_snapshot.scalars.DATE_1).toBe("01.09.2026");
    expect(f.rpc).toHaveBeenCalledWith("create_goreltech_group_document_batch", expect.objectContaining({ p_actor_id: actor, p_group_id: group, p_docs: f.inserts }));
  }, 30000);
  it("dry run compiles all nine artifacts without uploading, staging, committing or reserving numbers", async () => {
    const f = actualHandler("compile-group-class-journal"); const res = await f.handler(request("compile-group-class-journal", { dryRun: true }));
    expect(await res.clone().json()).not.toHaveProperty("error"); expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ writesPerformed: false, documentCount: 9 });
    expect(f.upload).not.toHaveBeenCalled(); expect(f.inserts).toHaveLength(0); expect(f.rpc.mock.calls.map(c => c[0])).toEqual(["uc_document_action_allowed", "get_group_program_facts"]);
  }, 30000);
  it("a failed authoritative commit reports failure and removes only newly uploaded uncommitted files", async () => {
    const f = actualHandler("compile-docx-contract", { rejectCommit: true }); const res = await f.handler(request("compile-docx-contract"));
    expect(res.status).toBe(500); expect(await res.json()).toMatchObject({ error: "program_document_proof_mismatch_refresh" });
    expect(f.remove).toHaveBeenCalledWith([f.uploads[0].path]);
  }, 30000);
});
