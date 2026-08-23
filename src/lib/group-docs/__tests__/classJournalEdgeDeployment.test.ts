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

    expect(source).toContain("goreltech-group-package-tenant-uuid-v9");
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
    expect(source).toContain("firstPositiveFiniteNumber(");
    expect(source).toContain("course?.duration");
    expect(source).toContain("doc_status: metadata.docStatus");
    expect(source).toContain("document_number: metadata.documentNumber");
    expect(source).toContain("documentNumber: document.document_number");
    expect(source).toContain("documentDate: document.document_date");
    expect(source).toContain('PROGRAM_HOURS: programHours > 0 ? String(programHours) : ""');
    expect(source).not.toContain('|| "Генеральный директор"');
  });

  it("не выдаёт фирменные шаблоны организации с теми же названием и ИНН, но другим UUID", () => {
    const source = fs.readFileSync(FUNCTION_SOURCE, "utf8");

    expect(source).toContain('const GORELTECH_ORGANIZATION_ID = "7237f9d4-3670-4a19-8946-a43c68fd3473"');
    expect(source).toContain('const GORELTECH_INN = "7806541216"');
    expect(source).toContain('String(organization.id || "").toLowerCase() === GORELTECH_ORGANIZATION_ID');
    expect(source).toContain('String(organization.inn || "").replace(/\\D/g, "") === GORELTECH_INN');
    expect(source).toContain('/ГОРЭЛТЕХ/i.test(String(organization.name || ""))');
    expect(source).toContain("Точные клиентские Word-шаблоны доступны только организации ГОРЭЛТЕХ");
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
    expect(source).toContain("goreltech-company-contract-tenant-uuid-v3");
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
