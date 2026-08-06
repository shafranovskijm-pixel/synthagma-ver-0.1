/**
 * DOCX-first журнал группы из оригинального Word-файла клиента.
 * Все значения перечитываются на сервере из СИНТАГМЫ; клиент передаёт
 * только UUID группы, режим и остальные legacy-документы этой же партии.
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
  otherDocuments: z.array(LegacyDocumentSchema).max(20).default([]),
});

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let uploadedPath: string | null = null;
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

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Недействительная сессия" }, 401);
    const userId = userData.user.id;
    const [{ data: isAdmin }, { data: hasPermission }, { data: isOwner }] = await Promise.all([
      admin.rpc("has_role", { _role: "admin", _user_id: userId }),
      admin.rpc("has_org_staff_permission", {
        _user_id: userId,
        _organization_id: body.organizationId,
        _permission: "documents.manage",
      }),
      admin.rpc("is_org_owner", { _user_id: userId, _organization_id: body.organizationId }),
    ]);
    if (!isAdmin && !hasPermission && !isOwner) {
      return json({ error: "Недостаточно прав для генерации журнала" }, 403);
    }

    const [groupResult, orgResult, profilesResult] = await Promise.all([
      admin
        .from("student_groups")
        .select("id, organization_id, name, group_number, program_title, program_hours, course_id, instructor_name, training_dates")
        .eq("id", body.groupId)
        .maybeSingle(),
      admin
        .from("organizations")
        .select("id, name, director_name")
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

    const baseUrl = new URL(
      "../_shared/group-doc-templates/goreltech/class-journal/v1/",
      import.meta.url,
    );
    const templateBytes = await Deno.readFile(new URL("template.docx", baseUrl));
    const manifest = JSON.parse(
      await Deno.readTextFile(new URL("manifest.json", baseUrl)),
    ) as ClassJournalManifest;
    const templateHash = await sha256Hex(templateBytes);
    if (templateHash !== String(manifest.template_sha256).toUpperCase()) {
      return json({ error: "Контрольная сумма Word-шаблона не совпала с манифестом" }, 409);
    }

    const dates = Array.isArray(group.training_dates) ? group.training_dates.map(String) : [];
    const programTitle = String(group.program_title || course?.title || "").trim();
    const programHours = Number(group.program_hours || course?.frdo_duration_hours || course?.duration || 0);
    const snapshot = {
      scalars: {
        GROUP_NUMBER: String(group.group_number || "").trim(),
        PROGRAM_TITLE: programTitle,
        PROGRAM_HOURS: programHours > 0 ? String(programHours) : "",
        INSTRUCTOR_SHORT: shortNameRu(String(group.instructor_name || "")),
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

    const zip = await JSZip.loadAsync(templateBytes);
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) return json({ error: "Повреждённый шаблон: нет word/document.xml" }, 500);
    let compiledXml: string;
    try {
      compiledXml = compileClassJournalXml({
        documentXml: await documentFile.async("string"),
        manifest,
        snapshot,
      });
    } catch (error) {
      return json({ error: (error as Error).message }, 422);
    }
    zip.file("word/document.xml", compiledXml);
    const outputBytes: Uint8Array = await zip.generateAsync({ type: "uint8array" });
    const outputHash = await sha256Hex(outputBytes);
    const documentId = crypto.randomUUID();
    uploadedPath = `organizations/${body.organizationId}/group-documents/${body.groupId}/${documentId}.docx`;
    const uploadResult = await admin.storage.from(BUCKET).upload(uploadedPath, outputBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });
    if (uploadResult.error) throw uploadResult.error;

    const today = new Date().toISOString().slice(0, 10);
    const journalDocument = {
      doc_type: "class_journal",
      name: `Журнал учета занятий — ${group.name}`,
      document_number: null,
      document_date: today,
      variables: snapshot.scalars,
      html: null,
      file_path: uploadedPath,
      doc_status: "draft",
      fill_mode: body.fillMode,
      layout_format: "docx_ooxml",
      source_note:
        "Макет, состав группы, программа, преподаватель и даты синхронизированы с СИНТАГМОЙ. Отметки посещаемости оставлены пустыми.",
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

    // Единая партия: legacy-документы и журнал DOCX сохраняются одним RPC.
    const safeLegacy = body.otherDocuments.map((document) => ({
      ...document,
      file_path: null,
      template_registry_key: null,
      template_version_label: null,
      template_sha256: null,
      variables_snapshot: null,
      docx_sha256: null,
      pdf_status: "unavailable",
      generation_status: "generated",
    }));
    const batchResult = await userClient.rpc("create_group_document_batch", {
      p_organization_id: body.organizationId,
      p_group_id: body.groupId,
      p_docs: [...safeLegacy, journalDocument],
    });
    if (batchResult.error) {
      await admin.storage.from(BUCKET).remove([uploadedPath]);
      uploadedPath = null;
      throw batchResult.error;
    }
    const batch = Array.isArray(batchResult.data) ? batchResult.data[0] : batchResult.data;
    return json({
      document: {
        doc_type: journalDocument.doc_type,
        name: journalDocument.name,
        file_path: uploadedPath,
        docx_sha256: outputHash,
        pdf_status: "unavailable",
        template_version_label: manifest.template_version,
      },
      batch,
    });
  } catch (error) {
    console.error("compile-group-class-journal error", error);
    return json({ error: (error as Error).message || "Внутренняя ошибка" }, 500);
  }
});
