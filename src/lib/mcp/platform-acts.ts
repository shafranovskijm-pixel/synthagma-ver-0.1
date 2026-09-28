import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolHandlerResult } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { renderPlatformAct } from "../platform-act/renderPlatformAct";
import { signatureBase64, stampBase64 } from "../platform-act/facsimileAssets";
import { approvedStoragePath, type InvoiceContext } from "./invoice-source";

const uuid = z.string().uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= "2000-01-01" && value <= "2100-12-31";
});
export const searchBillingOrganizationsShape = {
  query: z.string().trim().min(1).max(100),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).max(10000).default(0),
};
export const previewPlatformActShape = { organization_id: uuid, invoice_id: uuid, act_date: isoDate };
export const createPlatformActShape = { ...previewPlatformActShape, request_id: uuid, source_sha256: hash };
const previewSchema = z.object(previewPlatformActShape).strict();
const createSchema = z.object(createPlatformActShape).strict();
const searchSchema = z.object(searchBillingOrganizationsShape).strict();
const optionalText = z.string().nullable();
const sourceSchema = z.object({
  organization_id: uuid, invoice_id: uuid, invoice_number: z.string(), invoice_date: isoDate,
  amount_kopecks: z.number().int().safe(), plan: z.string(), period_months: z.number().int(),
  status: z.string(), paid_at: optionalText, buyer_is_override: z.boolean(),
  buyer: z.object({ name: optionalText, inn: optionalText, kpp: optionalText,
    director_name: optionalText, director_position: optionalText }),
});
const actSchema = z.object({
  id: uuid, request_id: uuid, organization_id: uuid, invoice_id: uuid,
  act_number: z.string(), act_date: isoDate, source_snapshot: sourceSchema,
  source_sha256: hash, html_snapshot: z.string().min(100).max(1048576), html_sha256: hash,
  storage_path: z.string(), document_name: z.string(), status: z.enum(["pending", "ready"]),
  billing_document_id: uuid.nullable(),
});
const legacySchema = z.object({ id: uuid, name: z.string(), file_url: z.string(), status: z.literal("legacy_existing") });
const contextSchema = z.object({ source: sourceSchema, source_sha256: hash, act_number: z.string(),
  existing_act: actSchema.nullable(), legacy_act: legacySchema.nullable() });
type Scope = z.infer<typeof previewSchema>;
type Act = z.infer<typeof actSchema>;
type ActSource = z.infer<typeof sourceSchema>;
type Legacy = z.infer<typeof legacySchema>;
export type PlatformActClientFactory = (token: string) => SupabaseClient;

class ActError extends Error {}
const publicErrors = new Set(["platform_admin_required", "invoice_not_found", "organization_not_found",
  "invalid_act_request", "request_id_conflict", "invoice_source_changed", "invoice_source_incomplete",
  "invalid_html_snapshot", "artifact_hash_mismatch", "artifact_not_uploaded", "act_not_found", "invalid_search", "act_in_trash", "invoice_act_already_exists"]);
function result(data: Record<string, unknown>, isError = false): ToolHandlerResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data,
    ...(isError ? { isError: true } : {}) };
}
function failure(error: unknown): ToolHandlerResult {
  return result({ error: error instanceof ActError ? error.message : "platform_act_unavailable" }, true);
}
function userClient(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new ActError("configuration_unavailable");
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false } });
}
function authorizedClient(ctx: InvoiceContext, factory: PlatformActClientFactory): SupabaseClient {
  if (!ctx.isAuthenticated() || !ctx.getToken()) throw new ActError("unauthorized");
  return factory(ctx.getToken()!);
}
async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await db.rpc(name, args);
  if (response.error) throw new ActError(publicErrors.has(response.error.message) ? response.error.message : "platform_act_unavailable");
  return response.data;
}
function parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, code = "invalid_input"): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ActError(code);
  return parsed.data;
}
async function getSource(db: SupabaseClient, scope: Scope) {
  const context = parse(contextSchema, await rpc(db, "sintagma_platform_act_source", {
    p_organization_id: scope.organization_id, p_invoice_id: scope.invoice_id,
  }), "invalid_source_response");
  if (context.source.organization_id !== scope.organization_id || context.source.invoice_id !== scope.invoice_id)
    throw new ActError("source_scope_mismatch");
  if (context.existing_act) assertActScope(context.existing_act, scope);
  return context;
}
function assertActScope(act: Act, scope: Scope) {
  if (act.organization_id !== scope.organization_id || act.invoice_id !== scope.invoice_id
    || act.source_snapshot.organization_id !== scope.organization_id || act.source_snapshot.invoice_id !== scope.invoice_id
    || act.storage_path !== `${scope.organization_id}/acts/api/${act.id}.html`)
    throw new ActError("source_scope_mismatch");
}
function basis(source: ActSource): string {
  const [year, month, day] = source.invoice_date.split("-");
  return `Счёт № ${source.invoice_number} от ${day}.${month}.${year}`;
}
function render(source: ActSource, actNumber: string, actDate: string): string {
  if (source.amount_kopecks <= 0 || !source.buyer.name?.trim() || !source.invoice_number.trim())
    throw new ActError("invoice_source_incomplete");
  return renderPlatformAct({ actNumber, actDate, basis: basis(source), amountKopecks: source.amount_kopecks,
    customerName: source.buyer.name, customerInn: source.buyer.inn,
    customerDirector: source.buyer.director_name, customerPosition: source.buyer.director_position,
    stampBase64, signatureBase64 });
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function actMetadata(act: Act) {
  return { id: act.id, organization_id: act.organization_id, invoice_id: act.invoice_id,
    act_number: act.act_number, act_date: act.act_date, amount_kopecks: act.source_snapshot.amount_kopecks,
    buyer: act.source_snapshot.buyer, billing_document_id: act.billing_document_id,
    source_sha256: act.source_sha256, html_sha256: act.html_sha256 };
}
async function signedUrl(db: SupabaseClient, path: string): Promise<string | null> {
  const signed = await db.storage.from("billing-documents").createSignedUrl(path, 120);
  if (signed.error || !signed.data?.signedUrl?.startsWith("https://")) return null;
  return signed.data.signedUrl;
}
async function legacyResult(db: SupabaseClient, scope: Scope, legacy: Legacy) {
  const location = approvedStoragePath(legacy, { source_kind: "org_billing_document", organization_id: scope.organization_id });
  const link = location ? await signedUrl(db, location.path) : null;
  return result({ status: "existing_legacy_act", created: false,
    act: { id: legacy.id, name: legacy.name.replace(/\u200B<inv:[0-9a-f-]{36}>\u200B/gi, ""),
      organization_id: scope.organization_id, invoice_id: scope.invoice_id },
    signed_download_url: link, expires_in_seconds: link ? 120 : null, bytes_verified: false,
    message: "Акт уже существует. Новый документ не создан; содержимое прежнего файла не проверялось." });
}

export async function searchSintagmaBillingOrganizations(input: unknown, ctx: InvoiceContext,
  factory: PlatformActClientFactory = userClient): Promise<ToolHandlerResult> {
  try {
    const query = parse(searchSchema, input);
    const db = authorizedClient(ctx, factory);
    const data = parse(z.object({ organizations: z.array(z.object({ id: uuid, name: z.string(), inn: optionalText, kpp: optionalText })) }),
      await rpc(db, "sintagma_search_billing_organizations", { p_query: query.query, p_limit: query.limit, p_offset: query.offset }),
      "invalid_source_response");
    return result({ organizations: data.organizations.slice(0, query.limit),
      next_offset: data.organizations.length > query.limit ? query.offset + query.limit : null });
  } catch (error) { return failure(error); }
}

export async function previewSintagmaInvoiceAct(input: unknown, ctx: InvoiceContext,
  factory: PlatformActClientFactory = userClient): Promise<ToolHandlerResult> {
  try {
    const scope = parse(previewSchema, input);
    const db = authorizedClient(ctx, factory);
    const context = await getSource(db, scope);
    if (context.legacy_act && context.existing_act?.status !== "ready") return await legacyResult(db, scope, context.legacy_act);
    if (context.existing_act) return result({ status: "existing_act", created: false,
      save_state: context.existing_act.status, act: actMetadata(context.existing_act),
      request_id: context.existing_act.request_id,
      message: "По этому счёту уже подготовлен акт. create с тем же запросом завершит сохранение при необходимости." });
    if (context.legacy_act) return await legacyResult(db, scope, context.legacy_act);
    const html = render(context.source, context.act_number, scope.act_date);
    return result({ status: "preview", created: false, source: context.source,
      act_number: context.act_number, act_date: scope.act_date, source_sha256: context.source_sha256,
      request_id: crypto.randomUUID(), html_sha256: await sha256(new TextEncoder().encode(html)),
      preview_images_omitted: true, preview_html: html.replace(/<img\b[^>]*>/g, ""),
      message: "Предварительный просмотр, без записи. Печать и факсимиле опущены только в этом просмотре; сохранённый файл использует существующий шаблон СИНТАГМЫ." });
  } catch (error) { return failure(error); }
}

export async function createSintagmaInvoiceAct(input: unknown, ctx: InvoiceContext,
  factory: PlatformActClientFactory = userClient): Promise<ToolHandlerResult> {
  try {
    const scope = parse(createSchema, input);
    const db = authorizedClient(ctx, factory);
    const context = await getSource(db, scope);
    if (context.legacy_act && !context.existing_act) return await legacyResult(db, scope, context.legacy_act);
    if (!context.existing_act && scope.source_sha256 !== context.source_sha256) throw new ActError("invoice_source_changed");
    const html = context.existing_act?.html_snapshot ?? render(context.source, context.act_number, scope.act_date);
    const prepared = parse(z.object({ act: actSchema.optional(), legacy_act: legacySchema.optional(), replayed: z.boolean() }),
      await rpc(db, "sintagma_prepare_platform_invoice_act", {
        p_organization_id: scope.organization_id, p_invoice_id: scope.invoice_id,
        p_request_id: scope.request_id, p_act_date: scope.act_date,
        p_source_sha256: scope.source_sha256, p_html: html,
      }), "invalid_source_response");
    if (prepared.legacy_act) return await legacyResult(db, scope, prepared.legacy_act);
    if (!prepared.act) throw new ActError("invalid_source_response");
    const act = prepared.act;
    assertActScope(act, scope);
    const bytes = new TextEncoder().encode(act.html_snapshot);
    if (await sha256(bytes) !== act.html_sha256) throw new ActError("artifact_hash_mismatch");
    const storage = db.storage.from("billing-documents");
    // Never overwrite. A failed upload may be a previous successful attempt; verify exact bytes.
    await storage.upload(act.storage_path, new Blob([bytes], { type: "text/html;charset=utf-8" }),
      { contentType: "text/html;charset=utf-8", upsert: false });
    const downloaded = await storage.download(act.storage_path);
    if (downloaded.error || !downloaded.data) return result({ status: "pending_storage", created: false,
      request_id: act.request_id, act: actMetadata(act), error: "artifact_not_verified",
      message: "Снимок сохранён, файл пока не подтверждён. Повторите тот же запрос для завершения." }, true);
    const verifiedHash = await sha256(new Uint8Array(await downloaded.data.arrayBuffer()));
    if (verifiedHash !== act.html_sha256) throw new ActError("artifact_hash_mismatch");
    const finalized = await rpc(db, "sintagma_finalize_platform_invoice_act", {
      p_act_id: act.id, p_verified_html_sha256: verifiedHash,
    });
    const legacy = z.object({ legacy_act: legacySchema }).safeParse(finalized);
    if (legacy.success) return await legacyResult(db, scope, legacy.data.legacy_act);
    const ready = parse(actSchema, finalized, "invalid_source_response");
    assertActScope(ready, scope);
    if (ready.status !== "ready" || !ready.billing_document_id) throw new ActError("act_not_ready");
    const link = await signedUrl(db, ready.storage_path);
    return result({ status: "saved", created: !prepared.replayed, replayed: prepared.replayed,
      act: actMetadata(ready), signed_download_url: link, expires_in_seconds: link ? 120 : null,
      bytes_verified: true, mime_type: "text/html", sent_to_client: false,
      message: "Акт сохранён в документах СИНТАГМЫ. Отправка клиенту не выполнялась." });
  } catch (error) { return failure(error); }
}
