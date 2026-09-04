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
  type ClassJournalManifest,
} from "../_shared/docx-ooxml/classJournal.ts";
import { shortNameRu } from "../_shared/docx-ooxml/money.ts";
import {
  buildCanonicalDocumentMetadataScalars,
  buildGroupDocumentScalars,
  canonicalizeLegacyDocumentMetadata,
  compileGroupDocumentXml,
  firstPositiveFiniteNumber,
  parseGeneratedHtmlRows,
  resolveLegacyDocumentDate,
  resolveDocumentSignatory,
  validateStudentRowsAgainstRoster,
  validateGroupDocumentPrerequisites,
  type GroupDocumentManifest,
} from "../_shared/docx-ooxml/groupDocument.ts";
import {
  CLASS_JOURNAL_MANIFEST_JSON,
  CLASS_JOURNAL_TEMPLATE_BASE64,
} from "../_shared/group-doc-templates/goreltech/class-journal/v1/embedded.ts";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../_shared/group-doc-templates/goreltech/group-package/v1/embedded.ts";
import {
  buildGroupDocumentFactRows,
  type GroupDocumentFactsResult,
} from "../_shared/docx-ooxml/groupDocumentFacts.ts";
import { loadGroupDocumentFacts } from "../_shared/docx-ooxml/groupDocumentFactsSource.ts";
import { loadGroupCompletionFacts } from "../_shared/docx-ooxml/groupCompletionFactsSource.ts";
import { applyGroupCompletionDecisions, type ConfirmedExpulsionFacts, type ConfirmedAttestationFacts } from "../_shared/docx-ooxml/groupCompletionDecisionFacts.ts";
import { loadGroupPassFacts } from "../_shared/docx-ooxml/groupPassFactsSource.ts";
import { buildGroupPassFactRows, type GroupPassFactsResult } from "../_shared/docx-ooxml/groupPassFacts.ts";
import { buildGroupTitleFacts, type GroupTitleFactsResult } from "../_shared/docx-ooxml/groupTitleFacts.ts";
import { buildGroupScheduleFacts, type GroupScheduleFactsResult } from "../_shared/docx-ooxml/groupScheduleFacts.ts";
import { loadGroupScheduleFacts, GROUP_SCHEDULE_FACTS_SELECT } from "../_shared/docx-ooxml/groupScheduleFactsSource.ts";
import {
  buildGroupClassJournalMarks,
  describeGroupClassJournalMarks,
  loadGroupClassJournalMarks,
  GROUP_CLASS_JOURNAL_MARKS_SELECT,
} from "../_shared/docx-ooxml/groupClassJournalMarks.ts";
import {
  buildGroupAttestationFacts,
  type GroupAttestationFactsResult,
} from "../_shared/docx-ooxml/groupAttestationFacts.ts";
import {
  buildGroupRegistrationFactRows,
  REGISTRATION_RECORD_SELECT,
  REGISTRATION_RECORD_STATUSES,
  type GroupRegistrationFactsResult,
} from "../_shared/docx-ooxml/groupRegistrationFacts.ts";
import { readGroupDocumentOperation, persistGroupDocumentOperation } from "../_shared/docx-ooxml/groupDocumentOperation.ts";

/**
 * Visible in every response so a live check can distinguish the deploy-safe
 * embedded-template compiler from the older Deno.readFile implementation.
 */
export const COMPILER_REVISION = "goreltech-group-package-server-facts-v22";
const GORELTECH_ORGANIZATION_ID = "7237f9d4-3670-4a19-8946-a43c68fd3473";
const GORELTECH_INN = "7806541216";

const BUCKET = "billing-documents";
const FACT_ROW_TYPES = ["enrollment_order", "expulsion_order", "student_list"] as const;
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

const SignatorySchema = z.object({
  position: z.string().max(200),
  name: z.string().max(300),
});

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
  signatory: SignatorySchema.optional(),
});

const BodySchema = z.object({
  organizationId: z.string().uuid(),
  groupId: z.string().uuid(),
  operationId: z.string().uuid().optional(),
  studentUserIds: z.array(z.string().uuid()).max(5000),
  /** @deprecated Общая дата старого клиента, только для fallback черновика. */
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  journalDocumentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fillMode: z.enum(["blank", "data"]).default("blank"),
  /**
   * Полная серверная проверка и сборка девяти DOCX в памяти без загрузки в
   * Storage и без вызова RPC сохранения. Требует той же авторизации и тех же
   * tenant/roster-проверок, что и обычная пересборка.
   */
  dryRun: z.boolean().default(false),
  includeJournal: z.boolean().default(true),
  journalSignatory: SignatorySchema.optional(),
  otherDocuments: z.array(LegacyDocumentSchema).max(20).default([]),
}).refine(
  (body) => body.includeJournal || body.otherDocuments.length > 0,
  { message: "Не выбран ни один документ" },
).refine(
  (body) => new Set(body.otherDocuments.map((document) => document.doc_type)).size === body.otherDocuments.length,
  { message: "Один тип документа нельзя добавить в пакет дважды", path: ["otherDocuments"] },
).refine(
  (body) => body.dryRun || Boolean(body.operationId),
  { message: "Обновите интерфейс: для сохранения нужен идентификатор операции", path: ["operationId"] },
);

const OperationStatusSchema = z.object({
  action: z.literal("operation-status"), organizationId: z.string().uuid(),
  groupId: z.string().uuid(), operationId: z.string().uuid(),
}).strict();

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

function instructorShortSlots(value: unknown): {
  first: string;
  second: string;
} {
  const names = String(value || "")
    .split(/[;\n]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map(shortNameRu);
  return {
    first: names[0] || "",
    second: names.slice(1).join("; "),
  };
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const responseHeaders = {
    ...corsHeaders,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-sintagma-required-compiler-revision",
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
  const statusWarnings: string[] = [];
  let storageAdmin: any = null;
  let persistenceStarted = false;
  let stage = "request-validation";
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Требуется авторизация" }, 401);

    const rawBody = await req.json();
    if (rawBody?.action === "operation-status") {
      const status = OperationStatusSchema.safeParse(rawBody);
      if (!status.success) return json({ error: "Некорректные данные операции", writesPerformed: false }, 400);
      if (req.headers.get("X-Sintagma-Required-Compiler-Revision") !== COMPILER_REVISION) {
        return json({ error: "Обновите интерфейс проверки операции", writesPerformed: false }, 409);
      }
      // Read-only receipt recovery does not depend on today's roster/form data.
      // SQL checks service role, authenticated actor permission and exact tenant/group.
      const statusUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const statusAuth = await statusUser.auth.getUser();
      if (statusAuth.error || !statusAuth.data?.user) return json({ error: "Недействительная сессия", writesPerformed: false }, 401);
      const statusAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      stage = "operation-status";
      const receipt = await readGroupDocumentOperation(statusAdmin, {
        actorId: statusAuth.data.user.id, ...status.data,
      });
      return json({ operationId: status.data.operationId, operationStatus: receipt ? "completed" : "unknown", writesPerformed: false, ...(receipt ? { receipt } : {}) });
    }
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ error: "Некорректные данные", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const body = {
      ...parsed.data,
      otherDocuments: parsed.data.otherDocuments.map((document) => ({
        ...document,
        // Весь пакет имеет один подтверждённый режим. Отдельный fill_mode из
        // browser payload не может повысить статус одного файла.
        fill_mode: parsed.data.fillMode,
        document_date: resolveLegacyDocumentDate({
          documentDate: document.document_date,
          legacySharedDraftDate: parsed.data.documentDate,
          fillMode: parsed.data.fillMode,
          docStatus: document.doc_status,
        }),
      })),
    };
    const requiredRevision = req.headers.get("X-Sintagma-Required-Compiler-Revision");
    // Old open tabs must refresh before saving: v20 requires durable operation IDs.
    if (requiredRevision !== COMPILER_REVISION) {
      return json({
        error: "Клиент не подтвердил точную ревизию безопасной серверной проверки",
        writesPerformed: false,
      }, 409);
    }
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
      // Caller-bound policy includes active membership/expiry, unlike the
      // permission-list helper alone. Keep this check on the user JWT.
      userClient.rpc("can_access_organization", {
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

    const operationScope = {
      actorId: userId, organizationId: body.organizationId,
      groupId: body.groupId, operationId: body.operationId || "",
    };
    if (!body.dryRun) {
      stage = "operation-preflight";
      const existingReceipt = await readGroupDocumentOperation(admin, operationScope);
      if (existingReceipt) return json({ ...existingReceipt, replayed: true });
    }

    stage = "source-data";
    const [groupResult, orgResult, profilesResult] = await Promise.all([
      admin
        .from("student_groups")
        .select("id, organization_id, name, group_number, program_title, program_hours, course_id, instructor_name, training_dates, start_date, end_date")
        .eq("id", body.groupId)
        .maybeSingle(),
      admin
        .from("organizations")
        .select("id, name, inn, kpp, ogrn, legal_address, director_name, director_position, bank_name, bank_bik, bank_account, bank_corr_account, email, phone")
        .eq("id", body.organizationId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("user_id, full_name, email, organization_id, student_group_id, archived_at")
        .eq("organization_id", body.organizationId)
        .eq("student_group_id", body.groupId)
        .is("archived_at", null)
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
    const requestedStudentIds = Array.from(new Set(body.studentUserIds)).sort();
    const activeStudentIds = ((profilesResult.data as any[]) || [])
      .map((profile) => String(profile.user_id))
      .sort();
    if (
      requestedStudentIds.length !== body.studentUserIds.length
      || requestedStudentIds.length !== activeStudentIds.length
      || requestedStudentIds.some((studentId, index) => studentId !== activeStudentIds[index])
    ) {
      return json({
        error: "Состав группы изменился. Обновите страницу перед формированием пакета документов",
        stage,
      }, 409);
    }
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
    const requestedLegacyTypes = new Set(body.otherDocuments.map((document) => document.doc_type));
    if (!body.includeJournal
      || body.otherDocuments.length !== LEGACY_TYPES.length
      || !LEGACY_TYPES.every((docType) => requestedLegacyTypes.has(docType))) {
      return json({
        error: "Клиентский комплект ГОРЭЛТЕХ пересобирается только целиком: 9 Word-документов",
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

    // IDs come exclusively from the tenant-checked database roster, never from
    // names/HTML. Enrollments have no organization_id: scope them to the checked
    // course AND the checked roster. FRDO rows require their own tenant filter.
    stage = "document-facts";
    const facts = await loadGroupDocumentFacts({
      organizationId: body.organizationId,
      courseId: course?.id || null,
      studentUserIds: activeStudentIds,
    }, {
      enrollments: async ({ courseId, studentUserIds, from, to }) => {
        const reply = await admin
        .from("enrollments")
        .select("id, user_id, course_id, status, progress, started_at, completed_at, document_facts_revision", { count: "exact" })
        .eq("course_id", courseId!)
        .in("user_id", studentUserIds)
        .order("id")
        .range(from, to);
        // Never compare a rounded unsafe bigint number with the SQL string token.
        return { ...reply, data: reply.data?.map(row => ({ ...row,
          document_facts_revision: typeof row.document_facts_revision === "string" ? row.document_facts_revision
            : Number.isSafeInteger(row.document_facts_revision) ? String(row.document_facts_revision) : undefined,
        })) ?? null };
      },
      // Passport/education access must also satisfy the caller's existing RLS.
      // documents.manage alone must not widen personal-data access via service role.
      studentFrdoData: async ({ organizationId, studentUserIds, from, to }) => await userClient
        .from("student_frdo_data")
        .select("id, user_id, organization_id, passport_series, passport_number, education_level, last_name, first_name, middle_name, birth_date, gender, citizenship_code", { count: "exact" })
        .eq("organization_id", organizationId)
        .in("user_id", studentUserIds)
        .order("id")
        .range(from, to),
    });
    const completionFacts = await loadGroupCompletionFacts({
      scope: {
        organizationId: body.organizationId,
        courseId: course?.id || null,
        studentUserIds: activeStudentIds,
      },
      enrollments: facts.enrollments,
      fillMode: body.otherDocuments.some((document) =>
        (document.doc_type === "attestation_sheet" || document.doc_type === "registration_book")
        && document.fill_mode === "data") ? "data" : "blank",
    }, {
      lessons: async ({ courseId, from, to }) => await admin
        .from("lessons")
        .select("id, course_id, type, order_index, test_passing_score, updated_at", { count: "exact" })
        .eq("course_id", courseId)
        .eq("type", "test")
        .order("id")
        .range(from, to),
      // Outcomes and document registers are limited by the caller's existing RLS.
      // Do not turn documents.manage into broader grade/personal-data access.
      attempts: async ({ lessonId, studentUserIds, completedSince, from, to }) => await userClient
        .from("test_attempts")
        .select("id, user_id, lesson_id, score, max_score, completed_at", { count: "exact" })
        .eq("lesson_id", lessonId)
        .in("user_id", studentUserIds)
        .gte("completed_at", completedSince)
        .order("id")
        .range(from, to),
      records: async ({ organizationId, enrollmentIds, from, to }) => await userClient
        .from("education_document_records")
        .select(REGISTRATION_RECORD_SELECT, { count: "exact" })
        .eq("organization_id", organizationId)
        .in("enrollment_id", enrollmentIds)
        .is("deleted_at", null)
        .in("document_status", [...REGISTRATION_RECORD_STATUSES])
        .order("id")
        .range(from, to),
    });
    const passFacts = await loadGroupPassFacts({
      organizationId: body.organizationId, groupId: body.groupId, studentUserIds: activeStudentIds,
    }, {
      // New personal/contact fields must satisfy the caller's existing RLS too.
      contacts: async ({ organizationId, groupId, studentUserIds, from, to }) => await userClient
        .from("profiles")
        .select("id, user_id, organization_id, student_group_id, archived_at, phone, company_id", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("student_group_id", groupId)
        .in("user_id", studentUserIds)
        .is("archived_at", null)
        .order("id")
        .range(from, to),
      companies: async ({ organizationId, companyIds, from, to }) => await userClient
        .from("companies")
        .select("id, organization_id, name", { count: "exact" })
        .eq("organization_id", organizationId)
        .in("id", companyIds)
        .order("id")
        .range(from, to),
    });
    const scheduleFacts = await loadGroupScheduleFacts({
      organizationId: body.organizationId, groupId: body.groupId,
    }, {
      schedule: async ({ organizationId, groupId }) => await userClient
        .from("group_document_schedules")
        .select(GROUP_SCHEDULE_FACTS_SELECT)
        .eq("organization_id", organizationId)
        .eq("group_id", groupId)
        .maybeSingle(),
    });
    const journalMarksSource = await loadGroupClassJournalMarks({
      organizationId: body.organizationId, groupId: body.groupId,
      fillMode: body.fillMode,
    }, {
      marks: async ({ organizationId, groupId, from, to }) => await userClient
        .from("group_class_journal_marks")
        .select(GROUP_CLASS_JOURNAL_MARKS_SELECT, { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("group_id", groupId)
        .order("id")
        .range(from, to),
    });
    const factSnapshot = {
      organization, group, course,
      profiles: profilesResult.data || [],
      enrollments: facts.enrollments,
      studentFrdoData: facts.studentFrdoData,
    };
    type ServerDocumentFacts = GroupDocumentFactsResult | GroupAttestationFactsResult | ConfirmedExpulsionFacts | ConfirmedAttestationFacts
      | GroupRegistrationFactsResult | GroupPassFactsResult | GroupTitleFactsResult | GroupScheduleFactsResult;
    const serverDocumentFacts = new Map<string, ServerDocumentFacts>();
    for (const docType of FACT_ROW_TYPES) {
      const factRows = buildGroupDocumentFactRows({
        docType,
        snapshot: factSnapshot,
      });
      serverDocumentFacts.set(docType, factRows);
    }
    serverDocumentFacts.set("attestation_sheet", buildGroupAttestationFacts({
      snapshot: { ...factSnapshot, lessons: completionFacts.lessons, testAttempts: completionFacts.testAttempts },
      fillMode: body.otherDocuments.find((document) => document.doc_type === "attestation_sheet")!.fill_mode,
      // No inferred latest/best or 2–5 policy: unresolved choices stay visible in draft warnings.
    }));
    // The authenticated caller reads one SQL snapshot. No service-role widening,
    // browser variables, percentages or automatically-created certificates decide issuance.
    let decisionContext: unknown = null;
    if (body.otherDocuments.some(document => ["expulsion_order", "attestation_sheet"].includes(document.doc_type) && document.fill_mode === "data")) {
      try {
        const decisionReply = await userClient.rpc("read_group_completion_decisions", {
          p_organization_id: body.organizationId, p_group_id: body.groupId,
        });
        if (!decisionReply.error) decisionContext = decisionReply.data;
      } catch { /* Missing deployment/network does not invent outcomes or break the other documents. */ }
    }
    const confirmedDecisionFacts = applyGroupCompletionDecisions({
      snapshot: factSnapshot, context: decisionContext,
      attestation: serverDocumentFacts.get("attestation_sheet") as GroupAttestationFactsResult,
      expulsionFillMode: body.otherDocuments.find(document => document.doc_type === "expulsion_order")!.fill_mode,
      attestationFillMode: body.otherDocuments.find(document => document.doc_type === "attestation_sheet")!.fill_mode,
    });
    serverDocumentFacts.set("expulsion_order", confirmedDecisionFacts.expulsion);
    serverDocumentFacts.set("attestation_sheet", confirmedDecisionFacts.attestation);
    serverDocumentFacts.set("registration_book", buildGroupRegistrationFactRows({
      snapshot: { ...factSnapshot, educationDocumentRecords: completionFacts.educationDocumentRecords },
      fillMode: body.otherDocuments.find((document) => document.doc_type === "registration_book")!.fill_mode,
    }));
    const passContactsByUser = new Map(passFacts.contacts.map((row) => [row.user_id, row]));
    const passDocumentFacts = buildGroupPassFactRows({
      snapshot: {
        organization,
        group,
        profiles: factSnapshot.profiles.map((profile) => ({
          ...profile,
          phone: passContactsByUser.get(profile.user_id)?.phone ?? null,
          company_id: passContactsByUser.get(profile.user_id)?.company_id ?? null,
        })),
        companies: passFacts.companies,
        journalMarksSource,
      },
      fillMode: body.fillMode,
    });
    for (const profile of factSnapshot.profiles) {
      if (!passContactsByUser.has(profile.user_id)) passDocumentFacts.issues.push({
        docType: "pass", code: "contact_not_available", field: "profiles",
        userId: profile.user_id, severity: "warning",
        message: "Телефон и связь с компанией участника не подтверждены доступными записями. Пустые поля не означают отсутствия данных в базе.",
      });
    }
    serverDocumentFacts.set("pass", passDocumentFacts);
    serverDocumentFacts.set("title_page", buildGroupTitleFacts({
      snapshot: { organization, group },
      documentDate: body.otherDocuments.find((document) => document.doc_type === "title_page")!.document_date,
    }));
    serverDocumentFacts.set("schedule", buildGroupScheduleFacts({
      snapshot: { organization, group, schedule: scheduleFacts.schedule },
      fillMode: body.otherDocuments.find((document) => document.doc_type === "schedule")!.fill_mode,
    }));
    const sourceDependencies: Record<string, readonly string[]> = {
      enrollment_order: ["enrollments"],
      expulsion_order: ["enrollments"],
      student_list: ["student_frdo_data"],
      attestation_sheet: ["enrollments", "lessons", "test_attempts"],
      registration_book: ["enrollments", "education_document_records", "student_frdo_data"],
      pass: ["pass_contacts", "companies"],
      title_page: [],
      schedule: ["group_document_schedules"],
    };
    const allSourceIssues = [...facts.sourceIssues, ...completionFacts.sourceIssues, ...passFacts.sourceIssues, ...scheduleFacts.sourceIssues];
    const documentSourceIssues = (docType: string) => allSourceIssues.filter((issue) =>
      sourceDependencies[docType]?.includes(issue.source));
    for (const [docType, factRows] of serverDocumentFacts) {
      const documentName = body.otherDocuments.find((document) => document.doc_type === docType)?.name || docType;
      for (const issue of factRows.issues) statusWarnings.push(`${documentName}: ${issue.message}`);
      for (const issue of documentSourceIssues(docType)) statusWarnings.push(`${documentName}: ${issue.message}`);
    }

    const instructorSlots = instructorShortSlots(group.instructor_name);
    const dates = Array.isArray(group.training_dates) ? group.training_dates.map(String) : [];
    const programTitle = String(group.program_title || course?.title || "").trim();
    const programHours = firstPositiveFiniteNumber(
      group.program_hours,
      course?.frdo_duration_hours,
      course?.duration,
    );
    const prerequisiteContext = {
      org_name: organization.name,
      group_number: group.group_number,
      program_title: programTitle,
      program_hours: programHours,
      start_date: group.start_date,
      end_date: group.end_date,
      instructor_name: group.instructor_name,
      training_dates: dates,
      students_count: ((profilesResult.data as any[]) || []).length,
    };
    const requestedDocuments = [
      ...body.otherDocuments.map((document) => ({
        docType: document.doc_type,
        fillMode: document.fill_mode,
      })),
      ...(body.includeJournal
        ? [{ docType: "class_journal" as const, fillMode: body.fillMode }]
        : []),
    ];
    for (const requestedDocument of requestedDocuments) {
      const prerequisiteIssues = validateGroupDocumentPrerequisites({
        docType: requestedDocument.docType,
        fillMode: requestedDocument.fillMode,
        context: prerequisiteContext,
      });
      if (prerequisiteIssues.length) {
        return json({
          error: `Документ ${requestedDocument.docType} не может быть сформирован: ${prerequisiteIssues.map((issue) => issue.message).join("; ")}`,
          details: prerequisiteIssues,
          docType: requestedDocument.docType,
          stage,
        }, 422);
      }
    }

    const activeStudentNames = ((profilesResult.data as any[]) || [])
      .map((profile) => profile.full_name);
    for (const document of body.otherDocuments) {
      const templateEntry = GROUP_DOCUMENT_TEMPLATE_BUNDLE[document.doc_type];
      if (!templateEntry) {
        return json({ error: `Нет Word-шаблона для ${document.doc_type}`, stage }, 422);
      }
      const manifest = JSON.parse(templateEntry.manifestJson) as GroupDocumentManifest;
      const canonicalFacts = serverDocumentFacts.get(document.doc_type);
      // Identity and scope were validated by IDs in the server builders. A
      // historical document's name may differ from the current profile; a name
      // comparison must not discard that real record or join it to another user.
      if (canonicalFacts) continue;
      const rows = manifest.row_source_key
        ? parseGeneratedHtmlRows(document.variables?.[manifest.row_source_key], manifest.row_tokens)
        : [];
      const rosterIssue = validateStudentRowsAgainstRoster({
        docType: document.doc_type,
        fillMode: document.fill_mode,
        rows,
        activeStudentNames,
      });
      if (rosterIssue) {
        return json({ error: rosterIssue, docType: document.doc_type, stage }, 409);
      }
    }

    // Приказы, список, ведомость, книга, пропуск и титул используют серверные данные. Остальные
    // строки, отдельные даты/подписанты и атомарная финализация ещё не
    // подтверждены. Поэтому не повышаем ни один документ до final.
    body.otherDocuments = body.otherDocuments.map((document) => {
      const metadata = canonicalizeLegacyDocumentMetadata({
        docType: document.doc_type,
        fillMode: document.fill_mode,
        docStatus: document.doc_status,
        documentNumber: document.document_number,
        documentDate: document.document_date,
        serverVerifiedCriticalRequisites: false,
        serverVerificationMessage:
          "сервер подтвердил организацию, группу и состав, но ещё не сверил все фактические поля документа с БД",
      });
      if (metadata.statusWarning) {
        statusWarnings.push(`${document.name}: ${metadata.statusWarning}`);
      }
      return {
        ...document,
        doc_status: metadata.docStatus,
        document_number: metadata.documentNumber,
        source_note: [document.source_note, metadata.statusWarning].filter(Boolean).join(" "),
      };
    });

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

    const journalSignatory = resolveDocumentSignatory(body.journalSignatory, organization);
    const journalMarks = buildGroupClassJournalMarks({
      snapshot: { organization, group, profiles: profilesResult.data || [], source: journalMarksSource },
      fillMode: body.fillMode,
    });
    for (const issue of journalMarks.issues) statusWarnings.push(`Журнал учета занятий: ${issue.message}`);
    const snapshot = {
      scalars: {
        GROUP_NUMBER: String(group.group_number || "").trim(),
        PROGRAM_TITLE: programTitle,
        PROGRAM_HOURS: programHours > 0 ? String(programHours) : "",
        INSTRUCTOR_SHORT: shortInstructorNames(group.instructor_name),
        SIGNATORY_POSITION: journalSignatory.position,
        SIGNATORY_SHORT: journalSignatory.shortName,
        DATE_1: formatJournalDate(dates[0] || ""),
        DATE_2: formatJournalDate(dates[1] || ""),
        DATE_3: formatJournalDate(dates[2] || ""),
        DATE_4: formatJournalDate(dates[3] || ""),
      },
      // Only current, explicitly saved group cells; never browser HTML or course progress.
      students: journalMarks.students,
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
    let journalPath: string | null = null;
    if (!body.dryRun) {
      const documentId = crypto.randomUUID();
      journalPath = `organizations/${body.organizationId}/group-documents/${body.groupId}/${documentId}.docx`;
      stage = "docx-upload";
      const uploadResult = await admin.storage.from(BUCKET).upload(journalPath, outputBytes, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });
      if (uploadResult.error) throw uploadResult.error;
      uploadedPaths.push(journalPath);
    }

    const journalDocumentDate = resolveLegacyDocumentDate({
      documentDate: body.journalDocumentDate,
      legacySharedDraftDate: body.documentDate,
      fillMode: body.fillMode,
      docStatus: "draft",
    });
    journalDocument = {
      doc_type: "class_journal",
      name: `Журнал учета занятий — ${group.name}`,
      document_number: null,
      document_date: journalDocumentDate,
      variables: snapshot.scalars,
      html: null,
      file_path: journalPath,
      doc_status: "draft",
      fill_mode: body.fillMode,
      layout_format: "docx_ooxml",
      source_note:
        "Оригинальный Word-бланк клиента с согласованными правками. Состав группы, программа, преподаватели и даты синхронизированы с СИНТАГМОЙ. "
        + describeGroupClassJournalMarks(journalMarks.attendanceSource),
      template_registry_key: manifest.template_id,
      template_version_label: manifest.template_version,
      template_sha256: manifest.template_sha256,
      variables_snapshot: {
        scalars: snapshot.scalars,
        students: snapshot.students.map((student, index) => ({
          row_number: index + 1,
          user_id: journalMarks.studentSources[index].user_id,
          full_name: student.STUDENT_NAME,
        })),
        signatory_source: journalSignatory.source,
        attendance_source: journalMarks.attendanceSource,
        mark_sources: journalMarks.markSources,
        attendance_issues: journalMarks.issues,
      },
      docx_sha256: outputHash,
      pdf_status: "unavailable",
      generation_status: "generated",
    };
    }

    // Все восемь клиентских шаблонов получают факты от серверных источников;
    // browser HTML не является источником строк или реквизитов расписания.
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
      const documentSignatory = resolveDocumentSignatory(document.signatory, organization);
      const factRows = serverDocumentFacts.get(document.doc_type);
      // Canonical templates use only the server fields below plus explicit
      // draft metadata/signatory. Do not retain hidden browser HTML in scalars.
      const packageScalars: Record<string, string> = factRows
        ? {}
        : buildGroupDocumentScalars(document.variables || {});
      Object.assign(packageScalars, {
        ...buildCanonicalDocumentMetadataScalars({
          documentNumber: document.document_number,
          documentDate: document.document_date,
        }),
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
        ORG_DIRECTOR_POSITION: String(organization.director_position || "").trim(),
        ORG_DIRECTOR_SHORT: shortNameRu(String(organization.director_name || "")),
        SIGNATORY_POSITION: documentSignatory.position,
        SIGNATORY_SHORT: documentSignatory.shortName,
        ORG_BANK_NAME: String(organization.bank_name || ""),
        ORG_BANK_BIK: String(organization.bank_bik || ""),
        ORG_BANK_ACCOUNT: String(organization.bank_account || ""),
        ORG_BANK_CORR_ACCOUNT: String(organization.bank_corr_account || ""),
        ORG_EMAIL: String(organization.email || ""),
        ORG_PHONE: String(organization.phone || ""),
        GROUP_NUMBER: String(group.group_number || ""),
        PROGRAM_TITLE: String(group.program_title || course?.title || ""),
        PROGRAM_HOURS: programHours > 0 ? String(programHours) : "",
        INSTRUCTOR_NAME: String(group.instructor_name || ""),
        INSTRUCTOR_SHORT: shortInstructorNames(group.instructor_name),
        INSTRUCTOR_1_SHORT: instructorSlots.first,
        INSTRUCTOR_2_SHORT: instructorSlots.second,
        RESPONSIBLE_PERSON_NAME: "Ляпко Дарья Константиновна",
        EXPULSION_OUTCOME: "без выдачи удостоверений о повышении квалификации",
        STUDENTS_COUNT: String(((profilesResult.data as any[]) || []).length),
      });
      if (factRows && "scalars" in factRows) Object.assign(packageScalars, factRows.scalars);
      const packageRows = factRows?.rows ?? (packageManifest.row_source_key
        ? parseGeneratedHtmlRows(
            document.variables?.[packageManifest.row_source_key],
            packageManifest.row_tokens,
          )
        : []);
      const packageXml = compileGroupDocumentXml({
        documentXml: await packageDocumentFile.async("string"),
        manifest: packageManifest,
        snapshot: { scalars: packageScalars, rows: packageRows,
          ...(factRows && "rowsBySource" in factRows ? { rowsBySource: factRows.rowsBySource } : {}),
        },
      });
      packageZip.file("word/document.xml", packageXml);
      const packageBytes: Uint8Array = await packageZip.generateAsync({ type: "uint8array" });
      const packageHash = await sha256Hex(packageBytes);
      let packagePath: string | null = null;
      if (!body.dryRun) {
        packagePath = `organizations/${body.organizationId}/group-documents/${body.groupId}/${crypto.randomUUID()}.docx`;
        stage = `package-upload-${document.doc_type}`;
        const packageUpload = await admin.storage.from(BUCKET).upload(packagePath, packageBytes, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: false,
        });
        if (packageUpload.error) throw packageUpload.error;
        uploadedPaths.push(packagePath);
      }

      const manualExpulsion = document.doc_type === "expulsion_order"
        && factRows?.issues.some((issue) => issue.code === "expulsion_classification_not_confirmed") === true;
      compiledPackageDocuments.push({
        ...document,
        fill_mode: manualExpulsion ? "blank" : document.fill_mode,
        doc_status: manualExpulsion ? "draft" : document.doc_status,
        document_number: manualExpulsion ? null : document.document_number,
        variables: factRows ? packageScalars : document.variables,
        html: null,
        file_path: packagePath,
        layout_format: "docx_ooxml",
        source_note: [
          "Оригинальный Word-бланк из архива клиента «для сайта (1).zip» с согласованными правками из Телемоста от 12.08.2026.",
          document.source_note,
          factRows ? "Данные получены сервером из сохранённой группы и доступных записей своей организации; совпадение ФИО не используется как связь." : null,
          document.doc_type === "title_page" ? "Год титула — год выбранной даты оформления, а не автоматически текущий год." : null,
          document.doc_type === "schedule" ? "Расписание — четыре сохранённых блока из настроек этой группы. Даты журнала и прохождение курса не являются источником расписания." : null,
          document.doc_type === "registration_book" ? "Запись реестра не подтверждает физическое вручение документа; подписи и отметки о вручении автоматически не проставляются." : null,
          factRows && "attendanceSource" in factRows ? "Посещаемость пропуска: " + describeGroupClassJournalMarks(factRows.attendanceSource) : null,
          factRows && "decisionSources" in factRows && factRows.decisionSources.length ? "Оценки и распределение по выдаче взяты из явных решений сотрудника по конкретным зачислениям. Это черновик, не подписанный приказ и не подтверждение вручения документов." : null,
          ...(factRows?.issues.map((issue) => issue.message) || []),
          ...documentSourceIssues(document.doc_type).map((issue) => issue.message),
        ].filter(Boolean).join(" "),
        template_registry_key: packageManifest.template_id,
        template_version_label: packageManifest.template_version,
        template_sha256: packageManifest.template_sha256,
        variables_snapshot: {
          scalars: packageScalars,
          rows: packageRows,
          ...(factRows && "rowsBySource" in factRows ? { rows_by_source: factRows.rowsBySource } : {}),
          ...(factRows && "decisionSources" in factRows ? { decision_sources: factRows.decisionSources, decision_source: "operator_confirmed_sql_snapshot_v1" } : {}),
          ...(factRows && "decisionCoverage" in factRows ? { decision_coverage: factRows.decisionCoverage } : {}),
          signatory_source: documentSignatory.source,
          fidelity_status: packageManifest.fidelity_status,
          ...(factRows && "scheduleSource" in factRows ? { schedule_source: factRows.scheduleSource } : {}),
          ...(factRows && "attendanceSource" in factRows ? { attendance_source: factRows.attendanceSource, mark_sources: factRows.markSources } : {}),
          ...(factRows ? {
            row_source: "server_database_ids",
            row_sources: factRows.rowSources,
            fact_issues: factRows.issues,
            source_issues: documentSourceIssues(document.doc_type),
          } : {}),
        },
        docx_sha256: packageHash,
        pdf_status: "unavailable",
        generation_status: "generated",
      });
    }

    if (body.dryRun) {
      stage = "dry-run-complete";
      const validatedDocuments = [
        ...compiledPackageDocuments,
        ...(journalDocument ? [journalDocument] : []),
      ].map((document) => ({
        doc_type: document.doc_type,
        name: document.name,
        doc_status: document.doc_status,
        document_number: document.document_number,
        document_date: document.document_date,
        template_registry_key: document.template_registry_key,
        template_version_label: document.template_version_label,
        template_sha256: document.template_sha256,
        docx_sha256: document.docx_sha256,
      }));
      return json({
        dryRun: true,
        writesPerformed: false,
        documentCount: validatedDocuments.length,
        documents: validatedDocuments,
        warnings: statusWarnings,
      });
    }

    stage = "batch-persistence";
    const persistedDocuments = [
      ...compiledPackageDocuments,
      ...(journalDocument ? [journalDocument] : []),
    ];
    // Once persistence starts, a lost response cannot authorize deleting uploads:
    // the transaction may still commit after a proxy timeout. The durable receipt
    // and batch are committed atomically by the scoped idempotent RPC.
    persistenceStarted = true;
    const receipt = await persistGroupDocumentOperation(admin, operationScope, persistedDocuments, statusWarnings);
    uploadedPaths.length = 0;
    stage = "complete";
    return json(receipt);
  } catch (error) {
    if (uploadedPaths.length && storageAdmin && !persistenceStarted) {
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
