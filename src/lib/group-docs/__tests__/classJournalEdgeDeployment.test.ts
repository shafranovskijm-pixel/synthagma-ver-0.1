import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { compileClassJournalXml } from "../../../../supabase/functions/_shared/docx-ooxml/classJournal";
import {
  CLASS_JOURNAL_MANIFEST_JSON,
  CLASS_JOURNAL_TEMPLATE_BASE64,
} from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/class-journal/v1/embedded";

const FUNCTION_SOURCE = path.resolve(
  __dirname,
  "../../../../supabase/functions/compile-group-class-journal/index.ts",
);
const CONTRACT_FUNCTION_SOURCE = path.resolve(
  __dirname,
  "../../../../supabase/functions/compile-docx-contract/index.ts",
);

function sourceSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `Missing source section: ${start}`).toBeGreaterThan(-1);
  expect(endIndex, `Missing source boundary: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

// These assertions verify the Edge wiring; they are not a live database/RLS execution test.
describe("compile-group-class-journal deployment contract", () => {
  it("keeps the DOCX inside the deployable TypeScript graph", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");

    expect(source).toContain("CLASS_JOURNAL_TEMPLATE_BASE64");
    expect(source).toContain("CLASS_JOURNAL_MANIFEST_JSON");
    expect(source).not.toContain("Deno.readFile(");
    expect(source).not.toContain("Deno.readTextFile(");
  });

  it("exposes a revision marker for live deployment verification", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");

    expect(source).toContain("goreltech-group-package-server-facts-v20");
    const clientSource = fs.readFileSync(path.resolve(__dirname, "../docxJournal.ts"), "utf8");
    expect(clientSource).toContain('GORELTECH_DRY_RUN_COMPILER_REVISION = "goreltech-group-package-server-facts-v20"');
    expect(source).toContain("function shortInstructorNames");
    expect(source).toContain("function instructorShortSlots");
    expect(source).toContain('split(/[;\\n]+/)');
    expect(source).toContain("INSTRUCTOR_1_SHORT: instructorSlots.first");
    expect(source).toContain("INSTRUCTOR_2_SHORT: instructorSlots.second");
    expect(source).toContain('second: names.slice(1).join("; ")');
    expect(source).not.toContain("instructorSlots.overflow");
    expect(source).toContain("GROUP_DOCUMENT_TEMPLATE_BUNDLE");
    expect(source).toContain("compileGroupDocumentXml");
    expect(source).toContain("uploadedPaths");
    expect(source).toContain("X-Sintagma-Compiler-Revision");
    expect(source).toContain("compilerRevision");
    expect(source).toContain("canonicalizeLegacyDocumentMetadata");
    expect(source).toContain("buildCanonicalDocumentMetadataScalars");
    expect(source).toContain("validateStudentRowsAgainstRoster");
    expect(source).toContain("journalDocumentDate: z.string()");
    expect(source).toContain("resolveLegacyDocumentDate({");
    expect(source).toContain("documentDate: document.document_date");
    expect(source).toContain("legacySharedDraftDate: parsed.data.documentDate");
    expect(source).not.toContain("const today = body.documentDate");
    expect(source).toContain("readGroupDocumentOperation");
    expect(source).toContain("persistGroupDocumentOperation");
    expect(source).toContain("storageAdmin && !persistenceStarted");
    expect(source).toContain("firstPositiveFiniteNumber(");
    expect(source).toContain("course?.duration");
    expect(source).toContain("doc_status: metadata.docStatus");
    expect(source).toContain("document_number: metadata.documentNumber");
    expect(source).toContain("documentNumber: document.document_number");
    expect(source).toContain("serverVerifiedCriticalRequisites: false");
    expect(source).toContain("statusWarnings.push");
    expect(source).toContain("warnings: statusWarnings");
    expect(source).not.toContain("document_date: parsed.data.documentDate");
    expect(source).toContain("actorId: userId");
    expect(source).not.toContain('rpc("create_group_document_batch"');
    expect(source).not.toContain('rpc("create_goreltech_group_document_batch"');
    expect(source).toContain('PROGRAM_HOURS: programHours > 0 ? String(programHours) : ""');
    expect(source).not.toContain('|| "Генеральный директор"');

    const tenantSourceRead = source.indexOf('stage = "source-data"');
    const statusCanonicalization = source.indexOf("serverVerifiedCriticalRequisites: false");
    expect(tenantSourceRead).toBeGreaterThan(-1);
    expect(statusCanonicalization).toBeGreaterThan(tenantSourceRead);
  });

  it("supports an authenticated no-write validation path before Storage and RPC persistence", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");

    expect(source).toContain('dryRun: z.boolean().default(false)');
    expect(source).toContain("X-Sintagma-Required-Compiler-Revision");
    expect(source).toContain('const requiredRevision = req.headers.get("X-Sintagma-Required-Compiler-Revision")');
    // Old tabs must refresh: an unkeyed legacy write cannot be retried safely.
    expect(source).toContain('if (requiredRevision !== COMPILER_REVISION)');
    expect(source.match(/if \(!body\.dryRun\)/g)).toHaveLength(3);
    expect(source).toContain('stage = "dry-run-complete"');
    expect(source).toContain("writesPerformed: false");
    expect(source).toContain("documentCount: validatedDocuments.length");

    const authGate = source.indexOf('stage = "authentication"');
    const revisionGate = source.indexOf('req.headers.get("X-Sintagma-Required-Compiler-Revision")');
    const tenantGate = source.indexOf("const isExactGoreltechOrganization");
    const dryRunExit = source.indexOf('stage = "dry-run-complete"');
    const persistence = source.indexOf('stage = "batch-persistence"');
    expect(authGate).toBeGreaterThan(-1);
    expect(revisionGate).toBeGreaterThan(-1);
    expect(authGate).toBeGreaterThan(revisionGate);
    expect(tenantGate).toBeGreaterThan(authGate);
    expect(dryRunExit).toBeGreaterThan(tenantGate);
    expect(persistence).toBeGreaterThan(dryRunExit);

    const dryRunBlock = source.slice(dryRunExit, persistence);
    expect(dryRunBlock).not.toContain(".storage.");
    expect(dryRunBlock).not.toContain(".rpc(");
  });

  it("persists unclassified expulsion as an explicit manual draft without changing other document modes", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const guard = sourceSection(source, "const manualExpulsion =", "compiledPackageDocuments.push({");
    expect(guard).toContain('document.doc_type === "expulsion_order"');
    expect(guard).toContain('&& factRows?.issues.some((issue) => issue.code === "expulsion_classification_not_confirmed") === true');
    const persisted = sourceSection(source, "compiledPackageDocuments.push({", 'if (body.dryRun)');
    expect(persisted).toContain('fill_mode: manualExpulsion ? "blank" : document.fill_mode');
    expect(persisted).toContain('doc_status: manualExpulsion ? "draft" : document.doc_status');
    expect(persisted).toContain('document_number: manualExpulsion ? null : document.document_number');
    expect(persisted.indexOf("...document,")).toBeLessThan(persisted.indexOf("fill_mode: manualExpulsion"));
    expect(persisted).toContain('...(factRows?.issues.map((issue) => issue.message) || [])');
    expect(persisted).toContain("fact_issues: factRows.issues");
    expect(persisted).toContain("rows: packageRows");
  });

  it("loads tenant-scoped database facts before compiling the three factual documents", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const tenantGate = source.indexOf("if (!isExactGoreltechOrganization)");
    const loadFacts = source.indexOf("const facts = await loadGroupDocumentFacts({");
    const buildFacts = source.indexOf("const factRows = buildGroupDocumentFactRows({");
    const compile = source.indexOf("const packageXml = compileGroupDocumentXml({");
    expect(tenantGate).toBeGreaterThan(-1);
    expect(loadFacts).toBeGreaterThan(tenantGate);
    expect(buildFacts).toBeGreaterThan(loadFacts);
    expect(compile).toBeGreaterThan(buildFacts);
    expect(source).toContain('const FACT_ROW_TYPES = ["enrollment_order", "expulsion_order", "student_list"] as const');
    expect(source).toContain('.select("user_id, full_name, email, organization_id, student_group_id, archived_at")');
    expect(source).toContain('.is("archived_at", null)');

    const adapters = source.slice(loadFacts, buildFacts);
    expect(adapters).toContain("studentUserIds: activeStudentIds");
    const enrollmentAdapter = adapters.slice(adapters.indexOf("enrollments: async"), adapters.indexOf("studentFrdoData: async"));
    expect(enrollmentAdapter).toContain('.from("enrollments")');
    expect(enrollmentAdapter).toContain('.eq("course_id", courseId!)');
    expect(enrollmentAdapter).toContain('.in("user_id", studentUserIds)');
    const frdoAdapter = sourceSection(adapters, "studentFrdoData: async", "const completionFacts");
    expect(frdoAdapter).toContain("=> await userClient");
    expect(frdoAdapter).not.toContain("=> await admin");
    expect(frdoAdapter).toContain('.from("student_frdo_data")');
    expect(frdoAdapter).toContain('.eq("organization_id", organizationId)');
    expect(frdoAdapter).toContain('.in("user_id", studentUserIds)');

    const beforeCompile = source.slice(buildFacts, compile);
    expect(beforeCompile).toContain("serverDocumentFacts.set(docType, factRows)");
    expect(beforeCompile).toContain("const factRows = serverDocumentFacts.get(document.doc_type)");
    expect(beforeCompile).toMatch(/const packageScalars: Record<string, string> = factRows\s*\? \{\}/);
    expect(beforeCompile).toContain("Object.assign(packageScalars, factRows.scalars)");
    expect(beforeCompile).toContain("const packageRows = factRows?.rows ??");
    expect(source.slice(compile)).toContain("snapshot: { scalars: packageScalars, rows: packageRows }");
    const persistedSnapshot = source.slice(source.indexOf("variables_snapshot:", compile));
    expect(persistedSnapshot).toContain('row_source: "server_database_ids"');
    expect(persistedSnapshot).toContain("row_sources: factRows.rowSources");
  });

  it("wires completion readers after tenant/course/roster checks and preserves caller RLS for sensitive facts", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const completionRead = source.indexOf("const completionFacts = await loadGroupCompletionFacts({");
    const tenantGate = source.indexOf("if (!isExactGoreltechOrganization)");
    const rosterGate = source.indexOf("requestedStudentIds.some");
    const courseScope = source.indexOf('.eq("organization_id", body.organizationId)', source.indexOf("let course:"));
    for (const gate of [tenantGate, rosterGate, courseScope]) {
      expect(gate).toBeGreaterThan(-1);
      expect(completionRead).toBeGreaterThan(gate);
    }
    expect(source).toContain('const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })');

    const readers = sourceSection(source, "const completionFacts = await loadGroupCompletionFacts({", "const factSnapshot =");
    expect(readers).toContain("organizationId: body.organizationId");
    expect(readers).toContain("courseId: course?.id || null");
    expect(readers).toContain("studentUserIds: activeStudentIds");
    expect(readers).toContain("enrollments: facts.enrollments");
    const lessons = sourceSection(readers, "lessons: async", "attempts: async");
    expect(lessons).toContain('.from("lessons")');
    expect(lessons).toContain('test_passing_score, updated_at');
    expect(lessons).toContain('.eq("course_id", courseId)');
    expect(lessons).toContain('.eq("type", "test")');
    expect(lessons).toContain('.range(from, to)');

    const attempts = sourceSection(readers, "attempts: async", "records: async");
    expect(attempts).toContain("=> await userClient");
    expect(attempts).not.toContain("=> await admin");
    expect(attempts).toContain('.from("test_attempts")');
    expect(attempts).toContain('.eq("lesson_id", lessonId)');
    expect(attempts).toContain('.in("user_id", studentUserIds)');
    expect(attempts).toContain('.gte("completed_at", completedSince)');
    expect(attempts).toContain('{ count: "exact" }');
    expect(attempts).toContain('.order("id")');
    expect(attempts).toContain('.range(from, to)');

    const records = readers.slice(readers.indexOf("records: async"));
    expect(records).toContain("=> await userClient");
    expect(records).not.toContain("=> await admin");
    expect(records).toContain('.from("education_document_records")');
    expect(records).toContain('.select(REGISTRATION_RECORD_SELECT, { count: "exact" })');
    expect(records).toContain('.eq("organization_id", organizationId)');
    expect(records).toContain('.in("enrollment_id", enrollmentIds)');
    expect(records).toContain('.is("deleted_at", null)');
    expect(records).toContain('.in("document_status", [...REGISTRATION_RECORD_STATUSES])');
    expect(records).toContain('.order("id")');
    expect(records).toContain('.range(from, to)');
  });

  it("reads journal marks through caller RLS and persists exact cell provenance without promoting draft", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const adapter = sourceSection(source, "const journalMarksSource = await loadGroupClassJournalMarks({", "const factSnapshot =");
    expect(source.indexOf(adapter)).toBeGreaterThan(source.indexOf("if (!isExactGoreltechOrganization)"));
    expect(source.indexOf(adapter)).toBeGreaterThan(source.indexOf("requestedStudentIds.some"));
    expect(adapter).toContain("fillMode: body.fillMode");
    expect(adapter).toContain("=> await userClient");
    expect(adapter).not.toContain("admin");
    expect(adapter).toContain('.from("group_class_journal_marks")');
    expect(adapter).toContain('.select(GROUP_CLASS_JOURNAL_MARKS_SELECT, { count: "exact" })');
    expect(adapter).toContain('.eq("organization_id", organizationId)');
    expect(adapter).toContain('.eq("group_id", groupId)');
    expect(adapter).toContain('.order("id")');
    expect(adapter).toContain('.range(from, to)');
    const journal = sourceSection(source, "const journalSignatory =", "// Все восемь клиентских шаблонов");
    expect(journal).toContain("buildGroupClassJournalMarks({");
    expect(journal).toContain("profiles: profilesResult.data || [], source: journalMarksSource");
    expect(journal).toContain("students: journalMarks.students");
    expect(journal).toContain("user_id: journalMarks.studentSources[index].user_id");
    expect(journal).toContain("attendance_source: journalMarks.attendanceSource");
    expect(journal).toContain("mark_sources: journalMarks.markSources");
    expect(journal).toContain("attendance_issues: journalMarks.issues");
    expect(journal).toContain("describeGroupClassJournalMarks(journalMarks.attendanceSource)");
    expect(journal).toContain('doc_status: "draft"');
    expect(journal).not.toContain('doc_status: "final"');
    expect(journal).not.toContain("parseGeneratedHtmlRows");
    expect(journal).not.toContain("document.variables");
    for (const slot of [1, 2, 3, 4]) expect(journal).toContain(`DATE_${slot}: formatJournalDate(dates[${slot - 1}] || "")`);
    const schema = sourceSection(source, "const BodySchema", "async function sha256Hex");
    expect(schema).not.toMatch(/journalMarks|markSources|attendanceSource/);
  });

  it("registers eight canonical document types without accepting attempts/record sources or policy from the browser", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const baseTypes = source.match(/const FACT_ROW_TYPES = \[([^\]]+)\] as const/)?.[1] || "";
    const names = [...baseTypes.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    names.push(...[...source.matchAll(/serverDocumentFacts\.set\("([^"]+)"/g)].map((match) => match[1]));
    expect(names.sort()).toEqual(["attestation_sheet", "enrollment_order", "expulsion_order", "pass", "registration_book", "schedule", "student_list", "title_page"]);
    const builders = sourceSection(source, "const factSnapshot =", "const sourceDependencies:");
    expect(builders).toContain("snapshot: factSnapshot");
    expect(builders).toContain("lessons: completionFacts.lessons, testAttempts: completionFacts.testAttempts");
    expect(builders).toContain("educationDocumentRecords: completionFacts.educationDocumentRecords");
    expect(builders).toContain('document.doc_type === "attestation_sheet")!.fill_mode');
    expect(builders).toContain('document.doc_type === "registration_book")!.fill_mode');
    expect(builders).not.toContain("document.variables");
    expect(builders).not.toContain("attemptPolicy:");
    const requestSchema = sourceSection(source, "const BodySchema", "async function sha256Hex");
    expect(requestSchema).not.toMatch(/testAttempts|educationDocumentRecords|attemptPolicy|passingScore/);
  });

  it("does not fall back to browser HTML for canonical rows, including empty results, and persists server provenance", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const rosterCheck = sourceSection(source, "const activeStudentNames =", "body.otherDocuments = body.otherDocuments.map");
    expect(rosterCheck).toContain("const canonicalFacts = serverDocumentFacts.get(document.doc_type)");
    expect(rosterCheck.indexOf("if (canonicalFacts) continue")).toBeLessThan(rosterCheck.indexOf("parseGeneratedHtmlRows("));

    const compile = sourceSection(source, "const compiledPackageDocuments =", "stage = \"dry-run-complete\"");
    expect(compile).toMatch(/const packageScalars: Record<string, string> = factRows\s*\? \{\}\s*:\s*buildGroupDocumentScalars/);
    expect(compile).toContain('if (factRows && "scalars" in factRows) Object.assign(packageScalars, factRows.scalars)');
    expect(compile).toContain("const packageRows = factRows?.rows ??");
    expect(compile).not.toMatch(/factRows\??\.rows\??\.length\s*\?/);
    expect(compile).toContain("snapshot: { scalars: packageScalars, rows: packageRows }");
    expect(compile).toContain("variables: factRows ? packageScalars : document.variables");
    expect(compile).toContain("html: null");
    expect(compile).toContain('row_source: "server_database_ids"');
    expect(compile).toContain("row_sources: factRows.rowSources");
    expect(compile).toContain("fact_issues: factRows.issues");
    expect(compile).toContain("source_issues: documentSourceIssues(document.doc_type)");
  });

  it("keeps source failures document-scoped and does not promote verified rows into final documents", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const dependencies = sourceSection(source, "const sourceDependencies:", "const instructorSlots =");
    expect(dependencies).toContain('attestation_sheet: ["enrollments", "lessons", "test_attempts"]');
    expect(dependencies).toContain('registration_book: ["enrollments", "education_document_records", "student_frdo_data"]');
    expect(dependencies).toContain("const allSourceIssues = [...facts.sourceIssues, ...completionFacts.sourceIssues, ...passFacts.sourceIssues, ...scheduleFacts.sourceIssues]");
    expect(dependencies).toContain("sourceDependencies[docType]?.includes(issue.source)");
    expect(dependencies).toContain("for (const issue of documentSourceIssues(docType)) statusWarnings.push");
    const metadata = sourceSection(source, "body.otherDocuments = body.otherDocuments.map", "let journalDocument:");
    expect(metadata).toContain("serverVerifiedCriticalRequisites: false");
    expect(metadata).toContain("doc_status: metadata.docStatus");
    expect(metadata).toContain("document_number: metadata.documentNumber");
    expect(source).not.toContain("serverVerifiedCriticalRequisites: true");
    expect(source).not.toMatch(/doc_status:\s*"final"/);
  });

  it("loads pass contacts and companies under caller RLS and derives the title without browser scalars", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const adapters = sourceSection(source, "const passFacts = await", "const scheduleFacts =");
    expect(adapters).toContain("studentUserIds: activeStudentIds");
    expect(adapters.match(/=> await userClient/g)).toHaveLength(2);
    expect(adapters).not.toContain("=> await admin");
    expect(adapters).toContain('.eq("organization_id", organizationId)');
    expect(adapters).toContain('.eq("student_group_id", groupId)');
    expect(adapters).toContain('.in("user_id", studentUserIds)');
    expect(adapters).toContain('.in("id", companyIds)');
    const builders = sourceSection(source, "const passContactsByUser", "const sourceDependencies:");
    expect(builders).toContain("phone: passContactsByUser.get(profile.user_id)?.phone ?? null");
    expect(builders).toContain("companies: passFacts.companies");
    expect(builders).toContain('serverDocumentFacts.set("pass", passDocumentFacts)');
    expect(builders).toContain('serverDocumentFacts.set("title_page", buildGroupTitleFacts({');
    expect(builders).toContain("snapshot: { organization, group }");
    expect(builders).not.toContain("document.variables");
    expect(builders).not.toContain("trainingDays(");
    expect(builders).toContain('code: "contact_not_available"');
    expect(source).toContain('pass: ["pass_contacts", "companies"]');
  });

  it("reads the saved schedule through caller RLS and persists its revision", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const adapter = sourceSection(source, "const scheduleFacts = await", "const factSnapshot =");
    expect(adapter).toContain("loadGroupScheduleFacts");
    expect(adapter).toContain("=> await userClient");
    expect(adapter).not.toContain("=> await admin");
    expect(adapter).toContain('.from("group_document_schedules")');
    expect(adapter).toContain('.eq("organization_id", organizationId)');
    expect(adapter).toContain('.eq("group_id", groupId)');
    expect(adapter).toContain(".maybeSingle()");
    const builders = sourceSection(source, "const factSnapshot =", "const sourceDependencies:");
    expect(builders).toContain('serverDocumentFacts.set("schedule", buildGroupScheduleFacts({');
    expect(builders).toContain("snapshot: { organization, group, schedule: scheduleFacts.schedule }");
    expect(builders).not.toContain("document.variables");
    expect(source).toContain('schedule: ["group_document_schedules"]');
    expect(source).toContain("schedule_source: factRows.scheduleSource");
  });

  it("requires idempotent persistence and cannot fall back to an unkeyed write", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const preflight = source.indexOf('stage = "operation-preflight"');
    const upload = source.indexOf('.storage.from(BUCKET).upload');
    const persistence = source.indexOf('persistenceStarted = true');
    expect(preflight).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(preflight);
    expect(persistence).toBeGreaterThan(upload);
    expect(source).toContain("const existingReceipt = await readGroupDocumentOperation(admin, operationScope)");
    expect(source).toContain("if (existingReceipt) return json({ ...existingReceipt, replayed: true })");
    expect(source).toContain("persistGroupDocumentOperation(admin, operationScope, persistedDocuments, statusWarnings)");
    expect(source).not.toContain('rpc("create_group_document_batch"');
    expect(source).not.toContain('rpc("create_goreltech_group_document_batch"');
    expect(source).not.toContain("isMissingRpcError");
    expect(source).not.toContain("unreferencedPaths");
    expect(source).toContain("storageAdmin && !persistenceStarted");
    expect(source).toContain("body.dryRun || Boolean(body.operationId)");
  });

  it("reads exact operation status with authentication, no compilation, and no writes", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const block = sourceSection(source, 'if (rawBody?.action === "operation-status")', "const parsed = BodySchema.safeParse(rawBody)");
    expect(block).toContain("OperationStatusSchema.safeParse(rawBody)");
    expect(block).toContain("statusUser.auth.getUser()");
    expect(block).toContain("statusAuth.data.user.id");
    expect(block).toContain("readGroupDocumentOperation(statusAdmin");
    expect(block).toContain('operationStatus: receipt ? "completed" : "unknown"');
    expect(block).toContain("writesPerformed: false");
    expect(block).not.toContain(".storage.");
    expect(block).not.toContain("persistGroupDocumentOperation(");
    expect(block).not.toContain("studentUserIds");
  });

  it("не выдаёт фирменные шаблоны организации с теми же названием и ИНН, но другим UUID", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");

    expect(source).toContain('const GORELTECH_ORGANIZATION_ID = "7237f9d4-3670-4a19-8946-a43c68fd3473"');
    expect(source).toContain('const GORELTECH_INN = "7806541216"');
    expect(source).toContain('String(organization.id || "").toLowerCase() === GORELTECH_ORGANIZATION_ID');
    expect(source).toContain('String(organization.inn || "").replace(/\\D/g, "") === GORELTECH_INN');
    expect(source).toContain('/ГОРЭЛТЕХ/i.test(String(organization.name || ""))');
    expect(source).toContain("Точные клиентские Word-шаблоны доступны только организации ГОРЭЛТЕХ");
    expect(source).toContain("Клиентский комплект ГОРЭЛТЕХ пересобирается только целиком: 9 Word-документов");
    expect(source).toContain("LEGACY_TYPES.every");
    expect(source).toContain("includeJournal: z.boolean().default(true)");
    expect(source).toContain("journalSignatory: SignatorySchema.optional()");
    expect(source).toContain("signatory: SignatorySchema.optional()");
    expect(source).toContain("resolveDocumentSignatory(body.journalSignatory, organization)");
    expect(source).toContain("resolveDocumentSignatory(document.signatory, organization)");
    expect(source).toContain("validateGroupDocumentPrerequisites");
    expect(source).toContain("start_date, end_date");
    expect(source).toContain("prerequisiteIssues");
    expect(source).toContain("}, 422)");
  });

  it("checks the admin role without the ambiguous has_role RPC overload", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");

    expect(source).not.toContain('.rpc("has_role"');
    expect(source).toContain('.from("user_roles")');
    expect(source).toContain('.eq("user_id", userId)');
    expect(source).toContain('.eq("role", "admin")');
    expect(source).toContain("const authzError = adminRoleResult.error ||");
    expect(source).toContain("if (authzError) throw authzError");
    expect(source).toContain("const isAdmin = Boolean(adminRoleResult.data)");
    expect(source).toContain('userClient.rpc("can_access_organization"');
    expect(source).not.toContain('admin.rpc("has_org_staff_permission"');
    const access = sourceSection(source, 'userClient.rpc("can_access_organization"', 'admin.rpc("is_org_owner"');
    expect(access).toContain('_permission: "documents.manage"');
    expect(access).toContain('_organization_id: body.organizationId');
    expect(source.indexOf('userClient.rpc("can_access_organization"')).toBeLessThan(source.indexOf('stage = "source-data"'));
  });

  it("keeps the contract compiler off the ambiguous has_role RPC overload", () => {
    const source = fs.readFileSync(CONTRACT_FUNCTION_SOURCE, "utf8");

    expect(source).not.toContain('.rpc("has_role"');
    expect(source).toContain('.from("user_roles")');
    expect(source).toContain('.eq("user_id", userId)');
    expect(source).toContain('.eq("role", "admin")');
    expect(source).toContain("const authzError = adminRoleResult.error ||");
    expect(source).toContain("if (authzError) throw authzError");
    expect(source).toContain("const isAdmin = Boolean(adminRoleResult.data)");
    expect(source).toContain("goreltech-company-contract-idempotent-roster-v4");
    expect(source).toContain("X-Sintagma-Compiler-Revision");
    expect(source).toContain("compilerRevision");
  });

  it("не выдаёт фирменный Word-договор при совпавших названии и ИНН, но другом UUID", () => {
    const source = fs.readFileSync(CONTRACT_FUNCTION_SOURCE, "utf8");

    expect(source).toContain('const GORELTECH_ORGANIZATION_ID = "7237f9d4-3670-4a19-8946-a43c68fd3473"');
    expect(source).toContain('const GORELTECH_INN = "7806541216"');
    expect(source).toContain('.from("organizations")');
    expect(source).toContain('.select("id, name, inn")');
    expect(source).toContain('String(organization.id || "").toLowerCase() === GORELTECH_ORGANIZATION_ID');
    expect(source).toContain('String(organization.inn || "").replace(/\\D/g, "") === GORELTECH_INN');
    expect(source).toContain('/ГОРЭЛТЕХ/i.test(String(organization.name || ""))');
    expect(source).toContain("Точный Word-шаблон договора доступен только организации ГОРЭЛТЕХ");

    const tenantGate = source.indexOf("const isExactGoreltechOrganization");
    const templateDecode = source.indexOf("decodeBase64Bytes(GORELTECH_COMPANY_CONTRACT_TEMPLATE_BASE64)");
    expect(tenantGate).toBeGreaterThan(-1);
    expect(templateDecode).toBeGreaterThan(tenantGate);
  });

  it("decodes, verifies and compiles the retained journal template", async () => {
    const templateBytes = Buffer.from(CLASS_JOURNAL_TEMPLATE_BASE64, "base64");
    const manifest = JSON.parse(CLASS_JOURNAL_MANIFEST_JSON);
    const templateHash = createHash("sha256").update(templateBytes).digest("hex").toUpperCase();

    expect(templateHash).toBe(manifest.template_sha256);

    const zip = await JSZip.loadAsync(templateBytes);
    const documentFile = zip.file("word/document.xml");
    expect(documentFile).not.toBeNull();

    const compiledXml = compileClassJournalXml({
      documentXml: await documentFile!.async("string"),
      manifest,
      snapshot: {
        scalars: {
          GROUP_NUMBER: "ДЕМО-01",
          PROGRAM_TITLE: "Проектирование электроустановок во взрывоопасных зонах",
          PROGRAM_HOURS: "32",
          INSTRUCTOR_SHORT: "И.И. Иванов",
          SIGNATORY_POSITION: "Генеральный директор",
          SIGNATORY_SHORT: "Дроздов Д.В.",
          DATE_1: "06.08.2026",
          DATE_2: "07.08.2026",
          DATE_3: "10.08.2026",
          DATE_4: "12.08.2026",
        },
        students: [{
          STUDENT_NAME: "Тестовый Слушатель",
          MARK_1: "",
          MARK_2: "",
          MARK_3: "",
          MARK_4: "",
        }],
      },
    });

    expect(compiledXml).not.toMatch(/\[\[[A-Z0-9_]+\]\]/);
    expect(compiledXml).toContain("Тестовый Слушатель");
  });
});
