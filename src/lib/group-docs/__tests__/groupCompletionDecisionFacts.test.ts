import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { applyGroupCompletionDecisions } from "../../../../supabase/functions/_shared/docx-ooxml/groupCompletionDecisionFacts";
import { inspectExpulsionDecisionSnapshot, parseGroupCompletionContext, type GroupCompletionContext } from "../../../../supabase/functions/_shared/docx-ooxml/groupCompletionDecisions";
import { buildGroupAttestationFacts } from "../../../../supabase/functions/_shared/docx-ooxml/groupAttestationFacts";
import { type GroupDocumentFactsSnapshot, type GroupDocumentFactsEnrollment, type GroupDocumentFactsProfile } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocumentFacts";
import { compileGroupDocumentXml, type GroupDocumentManifest } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocument";
import { findUnresolvedTokens } from "../../../../supabase/functions/_shared/docx-ooxml/xml";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/embedded";

// Committed, repeatable synthetic context: no dependency on a developer's D: SQL
// artifacts. A separate D: harness checks actual, unmodified PGlite RPC outputs.
const org = "7237f9d4-3670-4a19-8946-a43c68fd3473";
const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { organizationId: org, groupId: uuid(1) };
type Snapshot = Omit<GroupDocumentFactsSnapshot, "enrollments" | "profiles"> & {
  profiles: GroupDocumentFactsProfile[];
  enrollments: Array<GroupDocumentFactsEnrollment & { started_at: string | null; document_facts_revision: string }>;
};
function fixture(): { context: GroupCompletionContext; snapshot: Snapshot } {
  const context: GroupCompletionContext = {
    organization_id: org, can_manage: true,
    group: { id: scope.groupId, organization_id: org, course_id: uuid(2), name: "Синтетическая группа",
      start_date: "2026-09-01", end_date: "2026-09-05" },
    students: ["ТЕСТОВЫЙ Первый", "ТЕСТОВЫЙ Второй"].map((full_name, i) => ({
      user_id: uuid(10+i), full_name,
      enrollments: [{ id: uuid(20+i), user_id: uuid(10+i), course_id: uuid(2), status: "completed", progress: 100,
        started_at: "2026-09-01T09:00:00+00:00", completed_at: "2026-09-05T12:00:00+00:00", document_facts_revision: "9007199254740993" }],
      decision: {
        id: uuid(30+i), organization_id: org, group_id: scope.groupId, user_id: uuid(10+i), enrollment_id: uuid(20+i),
        enrollment_facts_revision: "9007199254740993", course_id: uuid(2), group_start_date: "2026-09-01", group_end_date: "2026-09-05",
        grade_text: i ? "Не аттестован — решение комиссии" : "Отлично — внесено вручную",
        issuance_decision: i ? "without_document" : "with_document",
        protocol_number: "ПР-1", protocol_date: "2026-09-05", decision_note: null,
        revision: 3, confirmed_by: uuid(40), confirmed_at: "2026-09-05T15:00:00+00:00",
      },
    })),
  };
  return { context, snapshot: {
    organization: { id: org },
    group: { ...context.group, group_number: "ДЕМО-1", program_title: "Синтетическая программа", program_hours: 40 },
    course: { id: uuid(2), organization_id: org, title: "Синтетический курс", duration: "40", frdo_duration_hours: 40 },
    profiles: context.students.map(student => ({ user_id: student.user_id, organization_id: org, student_group_id: scope.groupId,
      full_name: student.full_name, archived_at: null, email: null })),
    enrollments: context.students.flatMap(student => student.enrollments.map(enrollment => ({ ...enrollment }))),
    studentFrdoData: [],
  } };
}
type ApplyResult = ReturnType<typeof applyGroupCompletionDecisions>;
function apply(value = fixture(), options: {
  expulsionFillMode?: "blank" | "data"; attestationFillMode?: "blank" | "data"; context?: unknown;
} = {}): ApplyResult {
  const attestationFillMode = options.attestationFillMode ?? "data";
  const attestation = buildGroupAttestationFacts({ snapshot: { ...value.snapshot, lessons: [], testAttempts: [] }, fillMode: attestationFillMode });
  return applyGroupCompletionDecisions({ snapshot: value.snapshot, context: "context" in options ? options.context : value.context,
    attestation, expulsionFillMode: options.expulsionFillMode ?? "data", attestationFillMode });
}
function noClassification(result: ApplyResult) {
  expect(result.expulsion.rowsBySource).toEqual({ expulsion_with_issuance: [], expulsion_without_issuance: [] });
  expect(result.expulsion.decisionSources).toEqual([]);
  expect(result.attestation.decisionSources).toEqual([]);
  expect(result.attestation.rows.every(row => row.GRADE === "")).toBe(true);
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
function savedSnapshot(result = apply()) {
  return { decision_source: "operator_confirmed_sql_snapshot_v1", rows: result.expulsion.rows,
    rows_by_source: result.expulsion.rowsBySource, row_sources: result.expulsion.rowSources,
    decision_sources: result.expulsion.decisionSources, decision_coverage: result.expulsion.decisionCoverage };
}
const parseXml = (xml: string) => {
  const result = new DOMParser().parseFromString(xml, "application/xml");
  expect(result.getElementsByTagName("parsererror")).toHaveLength(0);
  return result;
};
const text = (node: Document | Element) => Array.from(node.getElementsByTagName("w:t")).map(item => item.textContent).join("");
async function compileActual(docType: "expulsion_order" | "attestation_sheet", facts: ApplyResult) {
  const asset = GROUP_DOCUMENT_TEMPLATE_BUNDLE[docType];
  const manifest = JSON.parse(asset.manifestJson) as GroupDocumentManifest;
  const bytes = Buffer.from(asset.templateBase64, "base64");
  expect(hash(bytes)).toBe(manifest.template_sha256.toUpperCase());
  expect(bytes).toEqual(readFileSync(resolve("supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/templates", `${docType}.docx`)));
  const source = await JSZip.loadAsync(bytes), target = await JSZip.loadAsync(bytes);
  const xml = await source.file("word/document.xml")!.async("string");
  const selected = docType === "expulsion_order" ? facts.expulsion : facts.attestation;
  const scalars = { ...Object.fromEntries(findUnresolvedTokens(xml).map(token => [token.slice(2,-2), ""])), ...selected.scalars };
  const compiled = compileGroupDocumentXml({ documentXml: xml, manifest,
    snapshot: { scalars, rows: selected.rows, ...(docType === "expulsion_order" ? { rowsBySource: facts.expulsion.rowsBySource } : {}) } });
  expect(findUnresolvedTokens(compiled)).toEqual([]);
  expect(compiled.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)).toEqual(xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
  const original = parseXml(xml), parsed = parseXml(compiled);
  const originalTables = Array.from(original.getElementsByTagName("w:tbl"));
  const tables = Array.from(parsed.getElementsByTagName("w:tbl"));
  expect(tables).toHaveLength(originalTables.length);
  const serializer = new XMLSerializer();
  originalTables.forEach((table, i) => {
    const headerCount = docType === "expulsion_order" ? 2 : manifest.repeater!.header_rows;
    Array.from(table.getElementsByTagName("w:tr")).slice(0,headerCount).forEach((row,j) =>
      expect(serializer.serializeToString(tables[i].getElementsByTagName("w:tr")[j])).toBe(serializer.serializeToString(row)));
  });
  target.file("word/document.xml", compiled);
  const savedBytes = await target.generateAsync({ type: "nodebuffer" });
  const saved = await JSZip.loadAsync(savedBytes);
  expect(Object.keys(saved.files).sort()).toEqual(Object.keys(source.files).sort());
  for (const [name, part] of Object.entries(source.files)) if (!part.dir && name !== "word/document.xml") {
    expect(await saved.file(name)!.async("nodebuffer"), name).toEqual(await part.async("nodebuffer"));
  }
  return { tables, parsed, compiled, original, bytes: savedBytes };
}

describe("explicit completion decisions to original GORELTECH document facts", () => {
  it("parses the SQL-shaped context, retaining bigint as an exact decimal string", () => {
    const value = fixture();
    const parsed = parseGroupCompletionContext(JSON.parse(JSON.stringify(value.context)), scope);
    expect(parsed).toEqual(value.context);
    expect(parsed.students[0].decision?.enrollment_facts_revision).toBe("9007199254740993");
  });
  it("separates explicit with/without decisions and uses exactly entered grades without online attempts", () => {
    const value = fixture(), result = apply(value);
    expect(result.expulsion.rows).toEqual([]);
    expect(result.expulsion.rowsBySource.expulsion_with_issuance.map(row=>row.STUDENT_NAME)).toEqual([value.context.students[0].full_name]);
    expect(result.expulsion.rowsBySource.expulsion_without_issuance.map(row=>row.STUDENT_NAME)).toEqual([value.context.students[1].full_name]);
    expect(result.expulsion.decisionSources).toHaveLength(2);
    for (const student of value.context.students) expect(result.attestation.rows.find(row=>row.STUDENT_NAME===student.full_name)).toMatchObject({
      GRADE: student.decision!.grade_text, PERCENT: "",
    });
    expect(result.expulsion.rowsBySource.expulsion_with_issuance[0].STUDENT_BASIS).toBe("");
    expect(result.expulsion.rowsBySource.expulsion_without_issuance[0].STUDENT_BASIS).toBe("");
    expect(result.expulsion).not.toHaveProperty("docStatus");
    expect(result.attestation).not.toHaveProperty("final");
  });
  it.each([null, {}, { students: [] }])("fails closed for unavailable/malformed raw context %j", context => noClassification(apply(fixture(),{context})));
  it("retains known results but never classifies a learner with no decision", () => {
    const value=fixture(); value.context.students[1].decision=null;
    const result=apply(value);
    expect(result.expulsion.rowsBySource.expulsion_with_issuance).toHaveLength(1);
    expect(result.expulsion.rowsBySource.expulsion_without_issuance).toEqual([]);
    expect(result.expulsion.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code:"completion_decision_missing_or_stale",userId:value.context.students[1].user_id })]));
    expect(result.attestation.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code:"completion_grade_missing",userId:value.context.students[1].user_id })]));
    expect(result.attestation.rows.find(row=>row.STUDENT_NAME===value.context.students[1].full_name)?.GRADE).toBe("");
  });
  it("does not infer grades or issuance from completed/100 percent/auto-created education records/browser text", () => {
    const value=fixture(); value.context.students.forEach(student=>{student.decision=null;});
    const snapshot={...value.snapshot, educationDocumentRecords: value.context.students.map(student=>({ enrollment_id:student.enrollments[0].id, document_status:"original",education_result:"ВЫДУМАННАЯ ОЦЕНКА" })),
      variables:{GRADE:"FORGED_BROWSER",EXPULSION_OUTCOME:"with_document"}, expulsionDecisions:[{userId:value.context.students[0].user_id,outcome:"with_document"}]};
    const lesson={id:uuid(80),course_id:uuid(2),type:"test",order_index:1,test_passing_score:50,updated_at:"2026-08-01T00:00:00Z"};
    const attestation=buildGroupAttestationFacts({snapshot:{...snapshot,lessons:[lesson],testAttempts:value.context.students.map((student,i)=>({
      id:uuid(90+i),user_id:student.user_id,lesson_id:lesson.id,score:10,max_score:10,completed_at:"2026-09-05T11:00:00Z",
    }))},fillMode:"data"});
    expect(attestation.rows.every(row=>row.PERCENT==="100")).toBe(true);
    const result=applyGroupCompletionDecisions({snapshot,context:value.context,attestation,expulsionFillMode:"data",attestationFillMode:"data"});
    noClassification(result); expect(JSON.stringify(result)).not.toContain("FORGED_BROWSER"); expect(JSON.stringify(result)).not.toContain("ВЫДУМАННАЯ");
  });
  it.each([
    ["organization", (v:ReturnType<typeof fixture>)=>{v.context.organization_id=uuid(99);}],
    ["group", (v:ReturnType<typeof fixture>)=>{v.context.group.id=uuid(99);}],
    ["course", (v:ReturnType<typeof fixture>)=>{v.context.group.course_id=uuid(99);}],
    ["start date", (v:ReturnType<typeof fixture>)=>{v.context.group.start_date="2026-09-02";}],
    ["end date", (v:ReturnType<typeof fixture>)=>{v.context.group.end_date="2026-09-06";}],
    ["changed name", (v:ReturnType<typeof fixture>)=>{v.context.students[0].full_name="Другое ФИО";}],
    ["changed roster", (v:ReturnType<typeof fixture>)=>{v.context.students.pop();}],
    ["foreign profile", (v:ReturnType<typeof fixture>)=>{v.snapshot.profiles[0].organization_id=uuid(99);}],
    ["duplicate source profile", (v:ReturnType<typeof fixture>)=>{v.snapshot.profiles.push({...v.snapshot.profiles[0]});}],
  ] as const)("fails closed on whole-context mismatch: %s", (_name, mutate)=>{const v=fixture();mutate(v);noClassification(apply(v));});
  it.each([
    ["old decision source token", (v:ReturnType<typeof fixture>)=>{v.context.students[0].decision!.enrollment_facts_revision="42";}],
    ["new source token, identical status/progress after reset", (v:ReturnType<typeof fixture>)=>{v.snapshot.enrollments[0].document_facts_revision="9007199254740994";}],
    ["missing source token", (v:ReturnType<typeof fixture>)=>{delete (v.snapshot.enrollments[0] as Partial<Snapshot["enrollments"][number]>).document_facts_revision;}],
    ["new started_at", (v:ReturnType<typeof fixture>)=>{v.snapshot.enrollments[0].started_at="2026-09-02T09:00:00+00:00";}],
    ["replaced enrollment UUID", (v:ReturnType<typeof fixture>)=>{v.snapshot.enrollments[0].id=uuid(98);}],
    ["ambiguous source enrollments", (v:ReturnType<typeof fixture>)=>{v.snapshot.enrollments.push({...v.snapshot.enrollments[0],id:uuid(98)});}],
    ["ambiguous context enrollments", (v:ReturnType<typeof fixture>)=>{v.context.students[0].enrollments.push({...v.context.students[0].enrollments[0],id:uuid(98)});}],
    ["stale decision course", (v:ReturnType<typeof fixture>)=>{v.context.students[0].decision!.course_id=uuid(98);}],
    ["stale decision period", (v:ReturnType<typeof fixture>)=>{v.context.students[0].decision!.group_end_date="2026-09-04";}],
    ["cancelled enrollment", (v:ReturnType<typeof fixture>)=>{v.context.students[0].enrollments[0].status="cancelled";v.snapshot.enrollments[0].status="cancelled";}],
  ] as const)("excludes only unconfirmed participant: %s", (_name,mutate)=>{
    const v=fixture();mutate(v);const result=apply(v);
    expect(result.expulsion.rowsBySource.expulsion_with_issuance).toEqual([]);
    expect(result.expulsion.rowsBySource.expulsion_without_issuance).toHaveLength(1);
    expect(result.attestation.rows.find(row=>row.STUDENT_NAME===v.context.students[0].full_name)?.GRADE).toBe("");
  });
  it("does not drop missing-name warnings or classify a nameless participant",()=>{
    const v=fixture();v.context.students[0].full_name="";v.snapshot.profiles[0].full_name="";
    const result=apply(v);
    expect(result.expulsion.rowsBySource.expulsion_with_issuance).toEqual([]);
    expect(result.expulsion.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:"missing_student_name",userId:v.context.students[0].user_id})]));
    expect(result.expulsion.rowsBySource.expulsion_without_issuance).toHaveLength(1);
  });
  it("does not reinterpret namesakes as one learner",()=>{
    const v=fixture();v.context.students[1].full_name=v.context.students[0].full_name;v.snapshot.profiles[1].full_name=v.snapshot.profiles[0].full_name;
    const result=apply(v);expect(result.expulsion.decisionSources.map(source=>source.userId).sort()).toEqual(v.context.students.map(student=>student.user_id).sort());
    expect(result.expulsion.rowsBySource.expulsion_with_issuance).toHaveLength(1);expect(result.expulsion.rowsBySource.expulsion_without_issuance).toHaveLength(1);
  });
  it.each([["blank","blank"],["blank","data"],["data","blank"]] as const)("respects independent fill modes %s / %s",(expulsionFillMode,attestationFillMode)=>{
    const result=apply(fixture(),{expulsionFillMode,attestationFillMode});
    if(expulsionFillMode==="blank")expect(result.expulsion.decisionSources).toEqual([]);else expect(result.expulsion.decisionSources).toHaveLength(2);
    if(attestationFillMode==="blank")expect(result.attestation.rows.every(row=>row.GRADE==="")).toBe(true);else expect(result.attestation.decisionSources).toHaveLength(2);
  });
  it("does not mutate source context, snapshot or incoming attestation rows",()=>{
    const v=fixture(),original=structuredClone(v);
    const attestation=buildGroupAttestationFacts({snapshot:{...v.snapshot,lessons:[],testAttempts:[]},fillMode:"data"}),before=structuredClone(attestation);
    applyGroupCompletionDecisions({snapshot:v.snapshot,context:v.context,attestation,expulsionFillMode:"data",attestationFillMode:"data"});
    expect(v).toEqual(original);expect(attestation).toEqual(before);
  });
});

describe("saved expulsion snapshot notice uses strict persisted evidence",()=>{
  it("recognizes full and partial proven coverage, not final/signed status",()=>{
    expect(inspectExpulsionDecisionSnapshot(savedSnapshot())).toEqual({confirmed:2,total:2});
    const v=fixture();v.context.students[1].decision=null;
    const result=apply(v);expect(inspectExpulsionDecisionSnapshot(savedSnapshot(result))).toEqual({confirmed:1,total:2});
    expect(result.expulsion.decisionCoverage.omitted).toEqual([{userId:v.context.students[1].user_id,fullName:v.context.students[1].full_name}]);
    expect(result.expulsion.issues.find(issue=>issue.code==="completion_decision_missing_or_stale")?.message).toContain(v.context.students[1].full_name);
  });
  it.each([null,{}, {decision_source:"operator_confirmed_sql_snapshot_v1"}])("does not accept a label alone: %j", value=>expect(inspectExpulsionDecisionSnapshot(value)).toBeNull());
  it.each([
    ["wrong source label", (v:ReturnType<typeof savedSnapshot>)=>{v.decision_source="browser";}],
    ["shared unclassified rows", (v:ReturnType<typeof savedSnapshot>)=>{v.rows.push({STUDENT_NAME:"UNPROVEN"});}],
    ["missing source UUID", (v:ReturnType<typeof savedSnapshot>)=>{v.decision_sources[0].decisionId="";}],
    ["invalid confirmation time", (v:ReturnType<typeof savedSnapshot>)=>{v.decision_sources[0].confirmedAt="not-a-date";}],
    ["invalid source token", (v:ReturnType<typeof savedSnapshot>)=>{v.decision_sources[0].enrollmentFactsRevision="1e9";}],
    ["wrong row/source identity", (v:ReturnType<typeof savedSnapshot>)=>{v.row_sources[0].userId=uuid(98);}],
    ["missing program token", (v:ReturnType<typeof savedSnapshot>)=>{delete v.rows_by_source.expulsion_with_issuance[0].STUDENT_PROGRAM;}],
    ["missing actual name", (v:ReturnType<typeof savedSnapshot>)=>{v.rows_by_source.expulsion_with_issuance[0].STUDENT_NAME="";}],
    ["invalid row number", (v:ReturnType<typeof savedSnapshot>)=>{v.rows_by_source.expulsion_with_issuance[0].N="2";}],
    ["wrong coverage count", (v:ReturnType<typeof savedSnapshot>)=>{v.decision_coverage.confirmed=3;}],
    ["omitted IDs overlap confirmed", (v:ReturnType<typeof savedSnapshot>)=>{v.decision_coverage.total=3;v.decision_coverage.omitted.push({userId:v.decision_sources[0].userId,fullName:"Overlap"});}],
    ["unproven extra classified row", (v:ReturnType<typeof savedSnapshot>)=>{v.rows_by_source.expulsion_without_issuance.push({...v.rows_by_source.expulsion_without_issuance[0],N:"2"});}],
  ] as const)("rejects malformed saved evidence: %s",(_name,mutate)=>{const v=savedSnapshot();mutate(v);expect(inspectExpulsionDecisionSnapshot(v)).toBeNull();});
  it("does not describe an entirely blank/missing-decision artifact as confirmed",()=>{
    const v=fixture();v.context.students.forEach(student=>{student.decision=null;});
    expect(inspectExpulsionDecisionSnapshot(savedSnapshot(apply(v)))).toBeNull();
  });
});

describe("actual retained DOCX integration",()=>{
  it("puts only explicitly classified names into their respective original tables and preserves all other ZIP parts",async()=>{
    const v=fixture(),result=apply(v),compiled=await compileActual("expulsion_order",result);
    expect(compiled.tables).toHaveLength(2);
    expect(text(compiled.tables[0])).toContain(v.context.students[0].full_name);
    expect(text(compiled.tables[0])).not.toContain(v.context.students[1].full_name);
    expect(text(compiled.tables[1])).toContain(v.context.students[1].full_name);
    expect(text(compiled.tables[1])).not.toContain(v.context.students[0].full_name);
    expect(text(compiled.parsed)).toContain("с выдачей удостоверений");
    expect(text(compiled.parsed)).toContain("без выдачи");
    expect(text(compiled.parsed)).not.toContain("г..");
  });
  it("inserts exact entered attestation GRADE, including literal token-like text, with no fabricated percentage",async()=>{
    const v=fixture();v.context.students[0].decision!.grade_text="Зачёт [[UNKNOWN]] & <лично>";
    const result=apply(v),compiled=await compileActual("attestation_sheet",result);
    expect(text(compiled.parsed)).toContain("Зачёт [[UNKNOWN]] & <лично>");
    expect(text(compiled.parsed)).toContain(v.context.students[1].decision!.grade_text);
    expect(result.attestation.rows.every(row=>row.PERCENT==="")).toBe(true);
  });
  it("keeps both original expulsion lists unfilled when all decisions are missing",async()=>{
    const v=fixture();v.context.students.forEach(student=>{student.decision=null;});
    const compiled=await compileActual("expulsion_order",apply(v));
    for(const table of compiled.tables)for(const student of v.context.students)expect(text(table)).not.toContain(student.full_name);
  });
  it.each(["expulsion_order","attestation_sheet"] as const)("blank %s preserves original unclassified form despite valid saved decisions",async(docType)=>{
    const v=fixture(),result=apply(v,{expulsionFillMode:"blank",attestationFillMode:"blank"});
    const compiled=await compileActual(docType,result);
    for(const student of v.context.students){
      if(docType==="expulsion_order")expect(text(compiled.parsed)).not.toContain(student.full_name);
      else expect(text(compiled.parsed)).not.toContain(student.decision!.grade_text);
    }
  });
});
