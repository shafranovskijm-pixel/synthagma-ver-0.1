import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../_shared/group-doc-templates/goreltech/group-package/v1/embedded.ts";
import { type GroupDocumentManifest } from "../_shared/docx-ooxml/groupDocument.ts";
import {
  ENROLLMENT_ORDER_BUCKET, ENROLLMENT_ORDER_REVISION, ENROLLMENT_ORDER_TEMPLATE_SHA256,
  EnrollmentOrderError, compileEnrollmentOrderDocumentXml, enrollmentOrderSha256, handleEnrollmentOrderAction,
} from "../_shared/docx-ooxml/enrollmentOrderIssue.ts";

/** Separate unsigned enrollment order; does not mutate group_documents or the nine-document draft batch. */
Deno.serve(async (request: Request) => {
  const headers = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return json({ revision: ENROLLMENT_ORDER_REVISION, error: "method_not_allowed" }, 405);
  let potentiallyMutating = false;
  try {
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return json({ revision: ENROLLMENT_ORDER_REVISION, error: "not_configured", message: "Оформление приказов пока не настроено на сервере." }, 503);
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ revision: ENROLLMENT_ORDER_REVISION, error: "unauthorized" }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ revision: ENROLLMENT_ORDER_REVISION, error: "unauthorized" }, 401);
    const raw = await request.text();
    if (raw.length > 16_384) return json({ revision: ENROLLMENT_ORDER_REVISION, error: "request_too_large" }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ revision: ENROLLMENT_ORDER_REVISION, error: "invalid_json" }, 400); }
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const storage = admin.storage.from(ENROLLMENT_ORDER_BUCKET);
    const result = await handleEnrollmentOrderAction(body, auth.user.id, {
      async rpc(name, args) {
        if (name === "reserve_goreltech_enrollment_order" || name === "complete_goreltech_enrollment_order") potentiallyMutating = true;
        const { data, error } = await admin.rpc(name, args);
        if (error) {
          if (error.code === "42501") throw new EnrollmentOrderError("forbidden", "Недостаточно прав для работы с приказами этой группы.", 403);
          if (error.code === "40001") throw new EnrollmentOrderError("snapshot_conflict", "Данные группы изменились. Перечитайте проверку; перед повтором проверьте статус операции.");
          if (error.code === "22023") throw new EnrollmentOrderError("invalid_requisites", "Сервер не подтвердил реквизиты приказа. Перечитайте проверку и исправьте замечания.", 400);
          throw new Error("enrollment_order_rpc_failed");
        }
        return data;
      },
      async compile(record) {
        const bundled = GROUP_DOCUMENT_TEMPLATE_BUNDLE.enrollment_order;
        const bytes = Uint8Array.from(atob(bundled.templateBase64), (char) => char.charCodeAt(0));
        if (await enrollmentOrderSha256(bytes) !== ENROLLMENT_ORDER_TEMPLATE_SHA256) throw new EnrollmentOrderError("template_mismatch", "Оригинальный Word-шаблон не подтверждён.");
        const manifest = JSON.parse(bundled.manifestJson) as GroupDocumentManifest;
        const zip = await JSZip.loadAsync(bytes);
        const document = zip.file("word/document.xml");
        if (!document) throw new EnrollmentOrderError("invalid_template", "В шаблоне отсутствует основной документ.");
        // Keep the retained entry timestamp: a resume must generate identical bytes/hash/path.
        zip.file("word/document.xml", compileEnrollmentOrderDocumentXml(await document.async("string"), manifest, record), { date: document.date, createFolders: false });
        return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
      },
      async upload(path, bytes) {
        const { error } = await storage.upload(path, bytes, { upsert: false, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        if (error) throw new Error("upload_unconfirmed");
      },
      async download(path) {
        const { data, error } = await storage.download(path);
        if (error || !data) throw new Error("download_unconfirmed");
        return new Uint8Array(await data.arrayBuffer());
      },
      async signedUrl(path) {
        const { data, error } = await storage.createSignedUrl(path, 300);
        if (error || !data?.signedUrl) throw new Error("signed_url_unavailable");
        return data.signedUrl;
      },
    });
    return json(result);
  } catch (error) {
    // Never include RPC values, frozen learner data or credentials in errors/logs.
    if (error instanceof EnrollmentOrderError) return json({ revision: ENROLLMENT_ORDER_REVISION, error: error.code, message: error.message, outcomeMayBeUnknown: potentiallyMutating }, error.status);
    return json({ revision: ENROLLMENT_ORDER_REVISION, error: "service_unavailable", outcomeMayBeUnknown: potentiallyMutating,
      message: potentiallyMutating
        ? "Результат операции пока не подтверждён. Проверьте её статус перед повтором; новый приказ не создавайте."
        : "Не удалось прочитать данные приказа. Повторите проверку позже.",
    }, 503);
  }
});
