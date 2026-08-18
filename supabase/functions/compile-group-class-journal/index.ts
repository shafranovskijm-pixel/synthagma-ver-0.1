/**
 * DOCX-first журнал группы из оригинального Word-файла клиента.
 * Сервер повторно проверяет организацию, группу, курс, участников и ключевые
 * реквизиты. Клиент передаёт режим и фактические табличные данные остальных
 * документов этой же атомарной партии.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { z } from "npm:zod@3.23.8";
import {
  compileClassJournalXml,
  formatJournalDate,
  initialsFirstNameRu,
  type ClassJournalManifest,
} from "../_shared/docx-ooxml/classJournal.ts";
import { shortNameRu } from "../_shared/docx-ooxml/money.ts";
import {
  buildGroupDocumentScalars,
  compileGroupDocumentXml,
  parseGeneratedHtmlRows,
  type GroupDocumentManifest,
} from "../_shared/docx-ooxml/groupDocument.ts";
import {
  CLASS_JOURNAL_MANIFEST_JSON,
  CLASS_JOURNAL_TEMPLATE_BASE64,
} from "../_shared/group-doc-templates/goreltech/class-journal/v1/embedded.ts";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../_shared/group-doc-templates/goreltech/group-package/v1/embedded.ts";

/**
 * Visible in every response so a live check can distinguish the deploy-safe
 * embedded-template compiler from the older Deno.readFile implementation.
 */
export const COMPILER_REVISION = "goreltech-group-package-tenant-uuid-v7";
const GORELTECH_ORGANIZATION_ID = "7237f9d4-3670-4a19-8946-a43c68fd3473";
const GORELTECH_INN = "7806541216";

const BUCKET = "billing-documents";
const LEGACY_TYPES = [
  "enrollment_order",
  "expulsion_order",
  "student_list",
  "schedule",
  "attestation_sheet",
  "registration_book",
  "title_page",
  "pass",
] as const;

const LegacyDocumentSchema = z.object({
  doc_type: z.enum(LEGACY_TYPES),
  name: z.string().min(1).max(300),
  document_number: z.string().max(100).nullish(),
  document_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  variables: z.record(z.string(), z.unknown()).default({}),
  html: z.string().max(2_000_000).nullish(),
  doc_status: z.enum(["draft", "final"]).default("draft"),
  fill_mode: z.enum(["blank", "data"]).default("blank"),
  layout_format: z.literal("legacy_html").default("legacy_html"),
  source_note: z.string().max(2000).nullish(),
});

const BodySchema = z.object({
  organizationId: z.string().uuid(),
  groupId: z.string().uuid(),
  fillMode: z.enum(["blank", "data"]).default("blank"),
  includeJournal: z.boolean().default(true),
  otherDocuments: z.array(LegacyDocumentSchema).max(20).default([]),
}).refine(
  (body) => body.includeJournal || body.otherDocuments.length > 0,
  { message: "Не выбран ни один документ" },
);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function decodeBase64Bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function shortInstructorNames(value: unknown): string {
  return String(value || "")
    .split(/[;\n]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map(shortNameRu)
    .join("; ");
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const responseHeaders = {
    ...corsHeaders,
    "Access-Control-Expose-Headers": "X-Sintagma-Compiler-Revision, X-Sintagma-Request-Id",
    "X-Sintagma-Compiler-Revision": COMPILER_REVISION,
    "X-Sintagma-Request-Id": requestId,
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? { ...(payload as Record<string, unknown>), compilerRevision: COMPILER_REVISION, requestId }
        : payload,
    ), {
      status,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    });

  const uploadedPaths: string[] = [];
  let storageAdmin: any = null;
  let stage = "request-validation";
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Требуется авторизация" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: "Некорректные данные", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const body = parsed.data;
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, service);
    storageAdmin = admin;

    stage = "authentication";
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Недействительная сессия" }, 401);
    const userId = userData.user.id;
    stage = "authorization";
    const [adminRoleResult, permissionResult, ownerResult] = await Promise.all([
      admin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle(),
      admin.rpc("has_org_staff_permission", {
        _user_id: userId,
        _organization_id: body.organizationId,
        _permission: "documents.manage",
      }),
      admin.rpc("is_org_owner", { _user_id: userId, _organization_id: body.organizationId }),
    ]);
    const authzError = adminRoleResult.error || permissionResult.error || ownerResult.error;
    if (authzError) throw authzError;
    const isAdmin = Boolean(adminRoleResult.data);
    const hasPermission = permissionResult.data;
    const isOwner = ownerResult.data;
    if (!isAdmin && !hasPermission && !isOwner) {
      return json({ error: "Недостаточно прав для генерации журнала" }, 403);
    }

    stage = "source-data";
    const [groupResult, orgResult, profilesResult] = await Promise.all([
      admin
        .from("student_groups")
        .select("id, organization_id, name, group_number, program_title, program_hours, course_id, instructor_name, training_dates")
        .eq("id", body.groupId)
        .maybeSingle(),
      admin
        .from("organizations")
        .select("id, name, inn, kpp, ogrn, legal_address, director_name, director_position, bank_name, bank_bik, bank_account, bank_corr_account, email, phone")
        .eq("id", body.organizationId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("user_id, full_name, organization_id, student_group_id")
        .eq("organization_id", body.organizationId)
        .eq("student_group_id", body.groupId)
        .order("full_name"),
    ]);
    if (groupResult.error) throw groupResult.error;
    if (orgResult.error) throw orgResult.error;
    if (profilesResult.error) throw profilesResult.error;
    const group = groupResult.data as any;
    const organization = orgResult.data as any;
    if (!group || group.organization_id !== body.organizationId) {
      return json({ error: "Группа не принадлежит выбранной организации" }, 409);
    }
    if (!organization) return json({ error: "Организация не найдена" }, 404);
    const isExactGoreltechOrganization =
      String(organization.id || "").toLowerCase() === GORELTECH_ORGANIZATION_ID
      && String(organization.inn || "").replace(/\D/g, "") === GORELTECH_INN
      && /ГОРЭЛТЕХ/i.test(String(organization.name || ""));
    if (!isExactGoreltechOrganization) {
      return json({
        error:
          "Точные клиентские Word-шаблоны доступны только организации ГОРЭЛТЕХ; для этой организации используйте общий пакет",
      }, 409);
    }

    let course: any = null;
    if (group.course_id) {
      const courseResult = await admin
        .from("courses")
        .select("id, organization_id, title, duration, frdo_duration_hours")
        .eq("id", group.course_id)
        .eq("organization_id", body.organizationId)
        .maybeSingle();
      if (courseResult.error) throw courseResult.error;
      course = courseResult.data;
    }

    let journalDocument: Record<string, unknown> | null = null;
    if (body.includeJournal) {
    stage = "template-validation";
    // Supabase deploys imported TypeScript modules but does not copy arbitrary
    // binary siblings. Embedding keeps the retained DOCX inseparable from the
    // deployed compiler; the manifest hash below still detects drift.
    const templateBytes = decodeBase64Bytes(CLASS_JOURNAL_TEMPLATE_BASE64);
    const manifest = JSON.parse(CLASS_JOURNAL_MANIFEST_JSON) as ClassJournalManifest;
    const templateHash = await sha256Hex(templateBytes);
    if (templateHash !== String(manifest.template_sha256).toUpperCase()) {
      return json({ error: "Контрольная сумма Word-шаблона не совпала с манифестом", stage }, 409);
    }

    const dates = Array.isArray(group.training_dates) ? group.training_dates.map(String) : [];
    const programTitle = String(group.program_title || course?.title || "").trim();
    const programHours = Number(group.program_hours || course?.frdo_duration_hours || course?.duration || 0);
    const snapshot = {
      scalars: {
        GROUP_NUMBER: String(group.group_number || "").trim(),
        PROGRAM_TITLE: programTitle,
        PROGRAM_HOURS: programHours > 0 ? String(programHours) : "",
        INSTRUCTOR_SHORT: shortInstructorNames(group.instructor_name),
        DIRECTOR_SIGNATURE: initialsFirstNameRu(String(organization.director_name || "")),
        DATE_1: formatJournalDate(dates[0] || ""),
        DATE_2: formatJournalDate(dates[1] || ""),
        DATE_3: formatJournalDate(dates[2] || ""),
        DATE_4: formatJournalDate(dates[3] || ""),
      },
      // Источника фактической посещаемости в СИНТАГМЕ пока нет: отметки пустые.
      students: ((profilesResult.data as any[]) || []).map((profile) => ({
        STUDENT_NAME: String(profile.full_name || "").trim(),
        MARK_1: "",
        MARK_2: "",
        MARK_3: "",
        MARK_4: "",
      })),
    };

    stage = "docx-compilation";
    const zip = await JSZip.loadAsync(templateBytes);
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) return json({ error: "Повреждённый шаблон: нет word/document.xml" }, 500);
    let compiledXml: string;
    try {
      compiledXml = compileClassJournalXml({
        documentXml: await documentFile.async("string"),
        manifest,
        snapshot,
        fillMode: body.fillMode,
      });
    } catch (error) {
      return json({ error: (error as Error).message, stage }, 422);
    }
    zip.file("word/document.xml", compiledXml);
    const outputBytes: Uint8Array = await zip.generateAsync({ type: "uint8array" });
    const outputHash = await sha256Hex(outputBytes);
    const documentId = crypto.randomUUID();
    const journalPath = `organizations/${body.organizationId}/group-documents/${body.groupId}/${documentId}.docx`;
    stage = "docx-upload";
    const uploadResult = await admin.storage.from(BUCKET).upload(journalPath, outputBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });
    if (uploadResult.error) throw uploadResult.error;
    uploadedPaths.push(journalPath);

    const today = new Date().toISOString().slice(0, 10);
    journalDocument = {
      doc_type: "class_journal",
      name: `Журнал учета занятий — ${group.name}`,
      document_number: null,
      document_date: today,
      variables: snapshot.scalars,
      html: null,
      file_path: journalPath,
      doc_status: "draft",
      fill_mode: body.fillMode,
      layout_format: "docx_ooxml",
      source_note:
        "Оригинальный Word-бланк клиента с согласованными правками. Состав группы, программа, преподаватели и даты синхронизированы с СИНТАГМОЙ; отметки посещаемости оставлены пустыми для ручного внесения.",
      template_registry_key: manifest.template_id,
      template_version_label: manifest.template_version,
      template_sha256: manifest.template_sha256,
      variables_snapshot: {
        scalars: snapshot.scalars,
        students: snapshot.students.map((student, index) => ({
          row_number: index + 1,
          full_name: student.STUDENT_NAME,
        })),
        attendance_source: "unavailable_blank",
      },
      docx_sha256: outputHash,
      pdf_status: "unavailable",
      generation_status: "generated",
    };
    }

    // Остальные документы собираются из точных клиентских DOCX. HTML здесь
    // используется исключительно как машинный транспорт данных строк таблиц.
    const compiledPackageDocuments = [];
    for (const document of body.otherDocuments) {
      stage = `package-template-${document.doc_type}`;
      const templateEntry = GROUP_DOCUMENT_TEMPLATE_BUNDLE[document.doc_type];
      if (!templateEntry) {
        throw new Error(`Нет Word-шаблона для ${document.doc_type}`);
      }
      const packageTemplateBytes = decodeBase64Bytes(templateEntry.templateBase64);
      const packageManifest = JSON.parse(templateEntry.manifestJson) as GroupDocumentManifest;
      const packageTemplateHash = await sha256Hex(packageTemplateBytes);
      if (packageTemplateHash !== String(packageManifest.template_sha256).toUpperCase()) {
        throw new Error(`Контрольная сумма Word-шаблона ${document.doc_type} не совпала`);
      }

      const packageZip = await JSZip.loadAsync(packageTemplateBytes);
      const packageDocumentFile = packageZip.file("word/document.xml");
      if (!packageDocumentFile) {
        throw new Error(`Повреждённый Word-шаблон ${document.doc_type}`);
      }
      const packageScalars = buildGroupDocumentScalars(document.variables || {});
      Object.assign(packageScalars, {
        ORG_NAME: String(organization.name || ""),
        ORG_SHORT_NAME: "ООО «ИЦ «ГОРЭЛТЕХ»",
        ORG_HEADER_LINE_1:
          "Учебный центр Общества с ограниченной ответственностью «Инжиниринговый центр «ГОРЭЛТЕХ»",
        ORG_HEADER_LINE_2: "(ООО «ИЦ «ГОРЭЛТЕХ»)",
        ORG_INN: String(organization.inn || ""),
        ORG_KPP: String(organization.kpp || ""),
        ORG_OGRN: String(organization.ogrn || ""),
        ORG_ADDRESS: String(organization.legal_address || ""),
        ORG_DIRECTOR_NAME: String(organization.director_name || ""),
        ORG_DIRECTOR_POSITION:
          String(organization.director_position || "").trim() || "Генеральный директор",
        ORG_DIRECTOR_SHORT: shortNameRu(String(organization.director_name || "")),
        ORG_BANK_NAME: String(organization.bank_name || ""),
        ORG_BANK_BIK: String(organization.bank_bik || ""),
        ORG_BANK_ACCOUNT: String(organization.bank_account || ""),
        ORG_BANK_CORR_ACCOUNT: String(organization.bank_corr_account || ""),
        ORG_EMAIL: String(organization.email || ""),
        ORG_PHONE: String(organization.phone || ""),
        GROUP_NUMBER: String(group.group_number || ""),
        PROGRAM_TITLE: String(group.program_title || course?.title || ""),
        PROGRAM_HOURS: String(
          group.program_hours || course?.frdo_duration_hours || course?.duration || "",
        ),
        INSTRUCTOR_NAME: String(group.instructor_name || ""),
        INSTRUCTOR_SHORT: shortInstructorNames(group.instructor_name),
        RESPONSIBLE_PERSON_NAME: "Ляпко Дарья Константиновна",
        EXPULSION_OUTCOME: "без выдачи удостоверений о повышении квалификации",
        STUDENTS_COUNT: String(((profilesResult.data as any[]) || []).length),
      });
      const packageRows = packageManifest.row_source_key
        ? parseGeneratedHtmlRows(
            document.variables?.[packageManifest.row_source_key],
            packageManifest.row_tokens,
          )
        : [];
      const packageXml = compileGroupDocumentXml({
        documentXml: await packageDocumentFile.async("string"),
        manifest: packageManifest,
        snapshot: { scalars: packageScalars, rows: packageRows },
      });
      packageZip.file("word/document.xml", packageXml);
      const packageBytes: Uint8Array = await packageZip.generateAsync({ type: "uint8array" });
      const packageHash = await sha256Hex(packageBytes);
      const packagePath = `organizations/${body.organizationId}/group-documents/${body.groupId}/${crypto.randomUUID()}.docx`;
      stage = `package-upload-${document.doc_type}`;
      const packageUpload = await admin.storage.from(BUCKET).upload(packagePath, packageBytes, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });
      if (packageUpload.error) throw packageUpload.error;
      uploadedPaths.push(packagePath);

      compiledPackageDocuments.push({
        ...document,
        html: null,
        file_path: packagePath,
        layout_format: "docx_ooxml",
        source_note:
          "Оригинальный Word-бланк из архива клиента «для сайта (1).zip» с согласованными правками из Телемоста от 12.08.2026.",
        template_registry_key: packageManifest.template_id,
        template_version_label: packageManifest.template_version,
        template_sha256: packageManifest.template_sha256,
        variables_snapshot: {
          scalars: packageScalars,
          rows: packageRows,
          fidelity_status: packageManifest.fidelity_status,
        },
        docx_sha256: packageHash,
        pdf_status: "unavailable",
        generation_status: "generated",
      });
    }
    stage = "batch-persistence";
    const batchResult = await userClient.rpc("create_group_document_batch", {
      p_organization_id: body.organizationId,
      p_group_id: body.groupId,
      p_docs: [
        ...compiledPackageDocuments,
        ...(journalDocument ? [journalDocument] : []),
      ],
    });
    if (batchResult.error) {
      if (uploadedPaths.length) await admin.storage.from(BUCKET).remove(uploadedPaths);
      uploadedPaths.length = 0;
      throw batchResult.error;
    }
    const batch = Array.isArray(batchResult.data) ? batchResult.data[0] : batchResult.data;
    stage = "complete";
    return json({
      document: journalDocument
        ? {
            doc_type: journalDocument.doc_type,
            name: journalDocument.name,
            file_path: journalDocument.file_path,
            docx_sha256: journalDocument.docx_sha256,
            pdf_status: journalDocument.pdf_status,
            template_version_label: journalDocument.template_version_label,
          }
        : null,
      batch,
    });
  } catch (error) {
    if (uploadedPaths.length && storageAdmin) {
      const cleanupPaths = [...uploadedPaths];
      uploadedPaths.length = 0;
      try {
        await storageAdmin.storage.from(BUCKET).remove(cleanupPaths);
      } catch (cleanupError) {
        console.error("compile-group-class-journal cleanup error", {
          requestId,
          cleanupPaths,
          cleanupError,
        });
      }
    }
    console.error("compile-group-class-journal error", {
      requestId,
      compilerRevision: COMPILER_REVISION,
      stage,
      error,
    });
    return json({ error: (error as Error).message || "Внутренняя ошибка", stage }, 500);
  }
});
