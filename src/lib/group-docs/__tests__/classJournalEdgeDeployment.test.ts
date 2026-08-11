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

    expect(source).toContain("goreltech-class-journal-authz-v3");
    expect(source).toContain("X-Sintagma-Compiler-Revision");
    expect(source).toContain("compilerRevision");
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
    expect(source).toContain("goreltech-company-contract-authz-v1");
    expect(source).toContain("X-Sintagma-Compiler-Revision");
    expect(source).toContain("compilerRevision");
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
          DIRECTOR_SIGNATURE: "Д.В. Дроздов",
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
