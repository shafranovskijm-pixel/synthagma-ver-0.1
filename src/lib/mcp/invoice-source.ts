import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext, ToolHandlerResult } from "@lovable.dev/mcp-js";
import { z } from "zod";

export const sourceKind = z.enum(["subscription_invoice", "org_billing_document", "company_document"]);
export const invoiceScopeShape = {
  source_kind: sourceKind,
  organization_id: z.string().uuid(),
  company_id: z.string().uuid().optional(),
};
export const searchInvoiceShape = {
  ...invoiceScopeShape,
  query: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).max(10000).default(0),
};
export const exportInvoiceShape = { ...invoiceScopeShape, source_id: z.string().uuid() };
const searchSchema = z.object(searchInvoiceShape).strict();
const exportSchema = z.object(exportInvoiceShape).strict();
type Scope = z.infer<typeof exportSchema>;
type Row = Record<string, unknown>;
type SourceKind = z.infer<typeof sourceKind>;
export type InvoiceContext = Pick<ToolContext, "isAuthenticated" | "getToken">;
export type InvoiceClientFactory = (token: string) => SupabaseClient;

export const INVOICE_COLUMNS = {
  subscription_invoice: "id,organization_id,invoice_number,invoice_date,amount,plan,period_months,status,buyer_name,buyer_inn,buyer_kpp,created_at",
  org_billing_document: "id,organization_id,name,doc_type,file_url,created_at,deleted_at",
  company_document: "id,company_id,type,name,file_path,file_size,amount,is_paid,uploaded_at,deleted_at",
} as const;
const TABLES = {
  subscription_invoice: "subscription_invoices",
  org_billing_document: "org_billing_documents",
  company_document: "company_documents",
} as const;
const SIGNED_URL_SECONDS = 120;

function userClient(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new SourceError("configuration_unavailable");
  // Use the caller's JWT for database AND storage RLS. Never use a service key.
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

class SourceError extends Error {}
function result(data: Record<string, unknown>, isError = false): ToolHandlerResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, ...(isError ? { isError: true } : {}) };
}
function textOrNull(value: unknown): string | null { return typeof value === "string" ? value : null; }
function amountOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

async function authorize(ctx: InvoiceContext, scope: Pick<Scope, "source_kind" | "organization_id" | "company_id">, factory: InvoiceClientFactory) {
  if (!ctx.isAuthenticated()) throw new SourceError("unauthorized");
  const token = ctx.getToken();
  if (!token) throw new SourceError("unauthorized");
  // Company IDs have meaning only in the training-company document domain.
  if ((scope.source_kind === "company_document") !== Boolean(scope.company_id)) throw new SourceError("invalid_company_scope");
  const db = factory(token);
  const permission = await db.rpc("can_access_organization", {
    _organization_id: scope.organization_id, _permission: "documents.read",
  });
  if (permission.error) throw new SourceError("access_check_failed");
  if (permission.data !== true) throw new SourceError("forbidden");

  const client = scope.source_kind === "company_document"
    ? await db.from("companies").select("id,organization_id,name,inn,kpp,email,address")
      .eq("id", scope.company_id!).eq("organization_id", scope.organization_id).maybeSingle()
    : await db.from("organizations").select("id,name,inn,kpp,email,legal_address")
      .eq("id", scope.organization_id).maybeSingle();
  if (client.error) throw new SourceError("client_read_failed");
  if (!client.data) throw new SourceError("scope_not_found");
  const row = client.data as Row;
  if (row.id !== (scope.company_id ?? scope.organization_id)
      || (scope.company_id && row.organization_id !== scope.organization_id)) throw new SourceError("scope_not_found");
  return { db, client: {
    id: textOrNull(row.id), name: textOrNull(row.name), inn: textOrNull(row.inn), kpp: textOrNull(row.kpp),
    email: textOrNull(row.email), address: textOrNull(scope.company_id ? row.address : row.legal_address),
  } };
}

function invoiceQuery(db: SupabaseClient, scope: Pick<Scope, "source_kind" | "organization_id" | "company_id">) {
  const columns: string = INVOICE_COLUMNS[scope.source_kind];
  let query = db.from(TABLES[scope.source_kind]).select(columns);
  query = scope.source_kind === "company_document"
    ? query.eq("company_id", scope.company_id!).eq("type", "invoice").is("deleted_at", null)
    : query.eq("organization_id", scope.organization_id);
  if (scope.source_kind === "org_billing_document") query = query.eq("doc_type", "invoice").is("deleted_at", null);
  return query;
}

function metadata(row: Row, kind: SourceKind, organizationId: string, companyId?: string) {
  return {
    source_system: "sintagma", source_kind: kind, source_id: textOrNull(row.id), organization_id: organizationId,
    company_id: companyId ?? null,
    invoice_number: kind === "subscription_invoice" ? textOrNull(row.invoice_number) : null,
    invoice_date: kind === "subscription_invoice" ? textOrNull(row.invoice_date) : null,
    name: textOrNull(row.name), amount: amountOrNull(row.amount), currency: null,
    buyer_name: kind === "subscription_invoice" ? textOrNull(row.buyer_name) : null,
    buyer_inn: kind === "subscription_invoice" ? textOrNull(row.buyer_inn) : null,
    buyer_kpp: kind === "subscription_invoice" ? textOrNull(row.buyer_kpp) : null,
    payment_status: kind === "subscription_invoice" ? textOrNull(row.status)
      : typeof row.is_paid === "boolean" ? (row.is_paid ? "paid" : "unpaid") : null,
    created_at: textOrNull(kind === "company_document" ? row.uploaded_at : row.created_at),
    file_size: kind === "company_document" ? amountOrNull(row.file_size) : null,
    content_type: null, sha256: null,
  };
}

export function approvedStoragePath(row: Row, scope: Pick<Scope, "source_kind" | "organization_id" | "company_id">) {
  const path = scope.source_kind === "company_document" ? textOrNull(row.file_path) : textOrNull(row.file_url);
  // URL fields in historical rows are not trusted network locations. Only exact
  // known object-key layouts are accepted; no URL fetch or legacy URL guessing.
  if (!path || path.length > 1024 || /[\\%?#:]/.test(path)
      || Array.from(path).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      || path.split("/").some(part => !part || part === "." || part === "..")) return null;
  const prefixes = scope.source_kind === "company_document"
    ? [`company-documents/${scope.company_id}/`]
    : [`${scope.organization_id}/`, `organizations/${scope.organization_id}/`];
  if (!prefixes.some(prefix => path.startsWith(prefix) && path.length > prefix.length)) return null;
  return { bucket: scope.source_kind === "company_document" ? "documents" : "billing-documents", path };
}

export async function searchSintagmaInvoices(input: unknown, ctx: InvoiceContext, factory: InvoiceClientFactory = userClient): Promise<ToolHandlerResult> {
  try {
    if (!ctx.isAuthenticated()) throw new SourceError("unauthorized");
    const parsed = searchSchema.safeParse(input);
    if (!parsed.success) throw new SourceError("invalid_input");
    const scope = parsed.data;
    const { db, client } = await authorize(ctx, scope, factory);
    let query = invoiceQuery(db, scope);
    if (scope.query) query = query.ilike(scope.source_kind === "subscription_invoice" ? "invoice_number" : "name", `%${scope.query.replace(/[\\%_]/g, "\\$&")}%`);
    const sortColumn = scope.source_kind === "subscription_invoice" ? "invoice_date" : scope.source_kind === "company_document" ? "uploaded_at" : "created_at";
    const { data, error } = await query.order(sortColumn, { ascending: false }).order("id", { ascending: true })
      .range(scope.offset, scope.offset + scope.limit) // one extra row for deterministic pagination
      .overrideTypes<Row[], { merge: false }>();
    if (error) throw new SourceError("invoice_read_failed");
    const rows = (data ?? []) as Row[];
    return result({ client, invoices: rows.slice(0, scope.limit).map(row => metadata(row, scope.source_kind, scope.organization_id, scope.company_id)),
      next_offset: rows.length > scope.limit ? scope.offset + scope.limit : null });
  } catch (error) { return result({ error: error instanceof SourceError ? error.message : "source_unavailable" }, true); }
}

export async function getSintagmaInvoiceExport(input: unknown, ctx: InvoiceContext, factory: InvoiceClientFactory = userClient): Promise<ToolHandlerResult> {
  try {
    if (!ctx.isAuthenticated()) throw new SourceError("unauthorized");
    const parsed = exportSchema.safeParse(input);
    if (!parsed.success) throw new SourceError("invalid_input");
    const scope = parsed.data;
    const { db, client } = await authorize(ctx, scope, factory);
    const { data, error } = await invoiceQuery(db, scope).eq("id", scope.source_id).maybeSingle()
      .overrideTypes<Row | null, { merge: false }>();
    if (error) throw new SourceError("invoice_read_failed");
    if (!data) throw new SourceError("invoice_not_found");
    const row = data as Row;
    const invoice = metadata(row, scope.source_kind, scope.organization_id, scope.company_id);
    if (scope.source_kind === "subscription_invoice") return result({ client, invoice,
      artifact: { status: "artifact_missing", reason: "subscription_record_has_no_original_file", signed_download_url: null } });
    const location = approvedStoragePath(row, scope);
    if (!location) return result({ client, invoice,
      artifact: { status: "artifact_missing", reason: "missing_or_unsupported_storage_path", signed_download_url: null } });
    const signed = await db.storage.from(location.bucket).createSignedUrl(location.path, SIGNED_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) throw new SourceError("artifact_unavailable");
    return result({ client, invoice, artifact: { status: "download_link_issued", signed_download_url: signed.data.signedUrl,
      expires_in_seconds: SIGNED_URL_SECONDS, bytes_verified: false } });
  } catch (error) { return result({ error: error instanceof SourceError ? error.message : "source_unavailable" }, true); }
}
