/**
 * DOCX-first компилятор договора по клиентскому Word-шаблону.
 *
 * Принцип: берём встроенный DOCX клиента, правим только word/document.xml
 * (скаляры, повторители, условные приложения) и сохраняем результат в приватный
 * bucket. Никакого DOCX → HTML → DOCX. PDF в этом окружении не рендерится:
 * возвращаем честный статус pdf_status = 'unavailable'.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import JSZip from "npm:jszip@3.10.1";
import { compileDocumentXml, numberStudents, validateSnapshot, type TemplateManifest } from "../_shared/docx-ooxml/compile.ts";
import { formatMoneyRu, moneyToWordsRu } from "../_shared/docx-ooxml/money.ts";
import { validateRelations, validateTemplateConsistency } from "../_shared/docx-ooxml/relational.ts";
import {
  GORELTECH_COMPANY_CONTRACT_MANIFEST_JSON,
  GORELTECH_COMPANY_CONTRACT_TEMPLATE_BASE64,
} from "../_shared/contract-templates/goreltech/company/v1/embedded.ts";

export const COMPILER_REVISION = "goreltech-company-contract-authz-v1";

const BUCKET = "billing-documents";

const RowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

const BodySchema = z.object({
  templateKey: z.string().min(1).max(200),
  organizationId: z.string().uuid(),
  groupId: z.string().uuid().nullish(),
  companyId: z.string().uuid(),
  studentUserIds: z.array(z.string().uuid()).max(500).default([]),
  contractName: z.string().min(1).max(300),
  contractNumber: z.string().min(1).max(100),
  contractDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount: z.number().positive().max(1_000_000_000),
  taxClauseExplicit: z.literal(true),
  scalars: RowSchema,
  programs: z.array(RowSchema).min(1).max(50),
  students: z.array(RowSchema).min(1).max(500),
  curricula: z.array(z.string().min(1)).default([]),
  studentsMeta: z.array(z.object({ user_id: z.string().uuid(), full_name: z.string() })).default([]),
});

const toStrings = (row: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]));

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeBase64Bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
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
    ), { status, headers: { ...responseHeaders, "Content-Type": "application/json" } });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Требуется авторизация" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Недействительная сессия" }, 401);
    const userId = userData.user.id;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Некорректные данные", details: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;

    const admin = createClient(url, service);

    // Авторизация: глобальный админ или сотрудник организации с правом на документы.
    const [adminRoleResult, permissionResult, ownerResult] = await Promise.all([
      admin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle(),
      admin.rpc("has_org_staff_permission", { _user_id: userId, _organization_id: body.organizationId, _permission: "documents.manage" }),
      admin.rpc("is_org_owner", { _user_id: userId, _organization_id: body.organizationId }),
    ]);
    const authzError = adminRoleResult.error || permissionResult.error || ownerResult.error;
    if (authzError) throw authzError;
    const isAdmin = Boolean(adminRoleResult.data);
    const hasPerm = permissionResult.data;
    const isOwner = ownerResult.data;
    if (!isAdmin && !hasPerm && !isOwner) return json({ error: "Недостаточно прав для генерации договора" }, 403);

    // Шаблон из реестра встроенных шаблонов.
    const { data: registry, error: regError } = await admin
      .from("contract_template_registry")
      .select("*")
      .eq("template_key", body.templateKey)
      .maybeSingle();
    if (regError) throw regError;
    if (!registry) return json({ error: "Шаблон не зарегистрирован" }, 404);
    if (registry.counterparty_type !== "legal") {
      return json({ error: "Этот шаблон предназначен только для договоров с компанией" }, 400);
    }
    if (registry.status === "retired") return json({ error: "Шаблон выведен из эксплуатации" }, 409);

    // Бинарный DOCX и манифест встроены в модуль: Supabase deploy не включает
    // произвольные соседние бинарные файлы в bundle Edge-функции.
    let docxBytes: Uint8Array;
    let manifest: TemplateManifest;
    try {
      docxBytes = decodeBase64Bytes(GORELTECH_COMPANY_CONTRACT_TEMPLATE_BASE64);
      manifest = JSON.parse(GORELTECH_COMPANY_CONTRACT_MANIFEST_JSON) as TemplateManifest;
    } catch (e) {
      return json({ error: "Встроенный Word-шаблон договора повреждён", details: String(e) }, 500);
    }

    const sourceHash = await sha256Hex(docxBytes);

    // Манифест, файл шаблона и метаданные реестра должны описывать один и тот же шаблон.
    const consistency = validateTemplateConsistency({
      manifest: manifest as unknown as Record<string, unknown>,
      registry: {
        template_key: registry.template_key,
        version_label: registry.version_label,
        template_sha256: registry.template_sha256,
        manifest: (registry.manifest || null) as Record<string, unknown> | null,
      },
      computedSourceSha256: sourceHash,
    });
    if (consistency.length) {
      return json({ error: "Манифест шаблона не согласован с реестром", issues: consistency }, 409);
    }

    // Реляционная проверка: связи создаём только по данным БД, а не по UUID от клиента.
    const uniqueStudentIds = Array.from(new Set(body.studentUserIds));
    const [companyRes, groupRes, profilesRes] = await Promise.all([
      admin.from("companies").select("id, organization_id").eq("id", body.companyId).maybeSingle(),
      body.groupId
        ? admin.from("student_groups").select("id, organization_id").eq("id", body.groupId).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      uniqueStudentIds.length
        ? admin.from("profiles").select("user_id, organization_id, student_group_id").in("user_id", uniqueStudentIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (companyRes.error) throw companyRes.error;
    if (groupRes.error) throw groupRes.error;
    if (profilesRes.error) throw profilesRes.error;

    const relational = validateRelations({
      organizationId: body.organizationId,
      companyId: body.companyId,
      groupId: body.groupId ?? null,
      studentUserIds: body.studentUserIds,
      studentsMetaIds: body.studentsMeta.map((s) => s.user_id),
      company: (companyRes.data as any) ?? null,
      group: (groupRes.data as any) ?? null,
      profiles: ((profilesRes.data as any[]) || []) as any,
    });
    if (!relational.ok) {
      return json({ error: relational.error, issues: relational.issues }, relational.status);
    }

    // Снимок данных: суммы считает сервер, чтобы цифры и прописью не расходились.
    const scalars = toStrings(body.scalars);
    scalars.PRICE_NUM = formatMoneyRu(body.totalAmount);
    scalars.PRICE_WORDS = moneyToWordsRu(body.totalAmount);
    scalars.DOC_NO = body.contractNumber;

    const snapshot = {
      scalars,
      programs: body.programs.map(toStrings),
      students: numberStudents(body.students.map(toStrings)),
      curricula: body.curricula,
      totalAmount: body.totalAmount,
      taxClauseExplicit: body.taxClauseExplicit,
    };

    const issues = validateSnapshot(manifest, snapshot);
    if (issues.length) return json({ error: "Не заполнены обязательные данные договора", issues }, 422);

    const zip = await JSZip.loadAsync(docxBytes);
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) return json({ error: "Повреждённый шаблон: нет word/document.xml" }, 500);

    let compiled;
    try {
      compiled = compileDocumentXml({ documentXml: await documentFile.async("string"), manifest, snapshot });
    } catch (e) {
      return json({ error: (e as Error).message }, 422);
    }

    zip.file("word/document.xml", compiled.documentXml);
    const outBytes: Uint8Array = await zip.generateAsync({ type: "uint8array" });
    const outHash = await sha256Hex(outBytes);

    const contractId = crypto.randomUUID();
    const docxPath = `organizations/${body.organizationId}/group-contracts/${contractId}.docx`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(docxPath, outBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: inserted, error: insertError } = await admin
      .from("org_contracts")
      .insert({
        id: contractId,
        organization_id: body.organizationId,
        name: body.contractName,
        contract_number: body.contractNumber,
        contract_date: body.contractDate,
        status: "draft",
        counterparty_type: "legal",
        company_id: body.companyId,
        student_group_id: body.groupId ?? null,
        students: body.studentsMeta,
        template_format: "docx_ooxml",
        template_registry_key: registry.template_key,
        template_version_label: registry.version_label,
        template_sha256: sourceHash,
        template_manifest: manifest as unknown as Record<string, unknown>,
        variables_snapshot: {
          scalars: snapshot.scalars,
          programs: snapshot.programs,
          students: snapshot.students,
          curricula: snapshot.curricula,
          total_amount: body.totalAmount,
          kept_curricula: compiled.keptCurricula,
        },
        docx_path: docxPath,
        docx_sha256: outHash,
        pdf_status: "unavailable",
        generation_status: "generated",
        file_path: docxPath,
      })
      .select("id, name, contract_number, contract_date, docx_path, pdf_status, template_version_label, generation_status")
      .single();
    if (insertError) {
      await admin.storage.from(BUCKET).remove([docxPath]);
      throw insertError;
    }

    return json({
      contract: inserted,
      docx_sha256: outHash,
      kept_curricula: compiled.keptCurricula,
      dropped_curricula: compiled.droppedCurricula,
      pdf_status: "unavailable",
    });
  } catch (e) {
    console.error("compile-docx-contract error", e);
    return json({ error: (e as Error).message || "Внутренняя ошибка" }, 500);
  }
});
