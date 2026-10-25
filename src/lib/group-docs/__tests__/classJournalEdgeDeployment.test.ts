import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { compileClassJournalXml } from '../../../../supabase/functions/_shared/docx-ooxml/classJournal.ts';
import {
  CLASS_JOURNAL_MANIFEST_JSON,
  CLASS_JOURNAL_TEMPLATE_BASE64,
} from '../../../../supabase/functions/_shared/group-doc-templates/goreltech/class-journal/v1/embedded.ts';

const FUNCTION_SOURCE = path.resolve(
  __dirname,
  "../../../../supabase/functions/compile-group-class-journal/index.ts",
);
const CONTRACT_FUNCTION_SOURCE = path.resolve(
  __dirname,
  "../../../../supabase/functions/compile-docx-contract/index.ts",
);

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

    expect(source).toContain("goreltech-group-package-dry-run-v14");
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
    expect(source).toContain('from("group_documents")');
    expect(source).toContain("committedPaths");
    expect(source).toContain("unreferencedPaths");
    expect(source).toContain("firstPositiveFiniteNumber(");
    expect(source).toContain("course?.duration");
    expect(source).toContain("doc_status: metadata.docStatus");
    expect(source).toContain("document_number: metadata.documentNumber");
    expect(source).toContain("documentNumber: document.document_number");
    expect(source).toContain("serverVerifiedCriticalRequisites: false");
    expect(source).toContain("statusWarnings.push");
    expect(source).toContain("warnings: statusWarnings");
    expect(source).not.toContain("document_date: parsed.data.documentDate");
    expect(source).toContain('admin.rpc("register_goreltech_group_document_stage"');
    expect(source).toContain('userClient.rpc("create_goreltech_group_document_batch"');
    expect(source).toContain("p_actor_id: userId");
    expect(source).not.toContain('userClient.rpc("create_group_document_batch"');
    expect(source).not.toContain("safeLegacyDraftDocuments");
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
    expect(source).toContain('req.headers.get("X-Sintagma-Required-Compiler-Revision") !== COMPILER_REVISION');
    expect(source.match(/if \(!body\.dryRun\)/g)).toHaveLength(2);
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

  it("requires exact server staging before caller-authorized persistence without a weaker fallback", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");
    const gate = source.indexOf("await requireDocumentWrite(userClient, body.organizationId, body.groupId)");
    const sourceRead = source.indexOf('stage = "source-data"');
    const stage = source.indexOf('admin.rpc("register_goreltech_group_document_stage"');
    const commit = source.indexOf('userClient.rpc("create_goreltech_group_document_batch"');
    expect(gate).toBeGreaterThan(-1);
    expect(sourceRead).toBeGreaterThan(gate);
    expect(stage).toBeGreaterThan(sourceRead);
    expect(commit).toBeGreaterThan(stage);
    expect(source.slice(stage, commit)).toContain("staged.data?.payload_sha256");
    for (const call of [stage, commit]) {
      expect(source.slice(call, call + 350)).toContain("p_actor_id: userId");
      expect(source.slice(call, call + 350)).toContain("p_organization_id: body.organizationId");
      expect(source.slice(call, call + 350)).toContain("p_group_id: body.groupId");
      expect(source.slice(call, call + 350)).toContain("p_docs: persistedDocuments");
    }
    expect(source).not.toContain("safeLegacyDraftDocuments");
    expect(source).not.toContain('userClient.rpc("create_group_document_batch"');
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

  it.each([FUNCTION_SOURCE, CONTRACT_FUNCTION_SOURCE])("uses active caller and scoped document rights instead of an unrestricted admin shortcut: %s", file => {
    const source = fs.readFileSync(file, "utf8");
    expect(source).not.toContain('.rpc("has_role"');
    expect(source).not.toContain("const isAdmin = Boolean(adminRoleResult.data)");
    expect(source).toContain("await requireActiveUser(req, admin)");
    expect(source).toContain("await requireDocumentWrite(userClient, body.organizationId, body.groupId)");
    expect(source).toContain(file === FUNCTION_SOURCE ? "uc-group-education-facts-20261019-v1" : "uc-program-facts-20261018-v1");
    expect(source).toContain("X-Sintagma-Compiler-Revision");
    expect(source).toContain("compilerRevision");
  });

  it('keeps the old capability and dispatches explicit education source before legacy parsing',()=>{
    const source=fs.readFileSync(FUNCTION_SOURCE,'utf8');
    expect(source).toContain('goreltech-group-package-dry-run-v14');
    expect(source).toContain('goreltech-group-package-uc013-v1');
    expect(source.indexOf('const sourcePresent = hasEducationSource(rawBody)')).toBeLessThan(source.indexOf('BodySchema.safeParse(rawBody)'));
    expect(source).toContain('resolveGroupEducationArtifact(userClient');
    expect(source).toContain('educationArtifactDocumentSnapshot(educationArtifact)');
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
