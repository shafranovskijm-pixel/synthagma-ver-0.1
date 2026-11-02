import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext, ToolHandlerResult } from "@lovable.dev/mcp-js";
import { z } from "zod";

export type SupportContext = Pick<ToolContext, "isAuthenticated" | "getToken">;
export type SupportClientFactory = (token: string) => SupabaseClient;
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const kind = z.enum(["platform_chat", "problem_report"]);
// PostgreSQL left(text,n) counts Unicode code points; JS string.length counts UTF-16 units.
const text = (max: number) => z.string().max(max * 2).refine(value => Array.from(value).length <= max);
const nullableText = (max: number) => text(max).nullable();
export const supportSearchShape = {
  source_kind: z.enum(["all", "platform_chat", "problem_report"]).default("all"),
  query: z.string().trim().min(1).max(100).optional(),
  status: z.string().trim().min(1).max(30).optional(),
  organization_id: uuid.optional(), user_id: uuid.optional(),
  updated_since: timestamp.optional(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2000).optional(),
};
export const supportDetailShape = {
  source_kind: kind, source_id: uuid,
  message_limit: z.number().int().min(1).max(100).default(50),
  message_cursor: z.string().min(1).max(2000).optional(),
};
const searchInput = z.object(supportSearchShape).strict();
const detailInput = z.object(supportDetailShape).strict();
const itemSchema = z.object({
  source_kind: kind, source_id: uuid, organization_id: uuid.nullable(),
  organization_name: nullableText(512), user_id: uuid.nullable(),
  user_name: nullableText(512), user_email: nullableText(320), contact_phone: nullableText(128),
  status: z.string().max(100), created_at: timestamp, last_activity_at: timestamp,
  title: nullableText(1000), excerpt: nullableText(1000),
  unread_for_admin: z.number().int().nonnegative().nullable(),
});
const listPosition = z.object({ created_at: timestamp, source_kind: kind, source_id: uuid }).strict();
const messagePosition = z.object({ created_at: timestamp, id: uuid }).strict();
const searchOutput = z.object({ items: z.array(itemSchema).max(50), has_more: z.boolean(), next_cursor: listPosition.nullable() });
const detailOutput = z.object({
  item: itemSchema,
  messages: z.array(z.object({ id: uuid, role: z.string().max(100), content: text(16000),
    content_truncated: z.boolean(), sender_user_id: uuid.nullable(), sender_name: nullableText(512),
    is_read: z.boolean(), created_at: timestamp })).max(100),
  has_more_messages: z.boolean(), next_message_cursor: messagePosition.nullable(),
  report: z.object({ description: nullableText(16000), description_truncated: z.boolean(),
    admin_notes: nullableText(8000), admin_notes_truncated: z.boolean(), page_url: nullableText(2000),
    user_role: nullableText(100), has_diagnostics: z.boolean(), has_screenshot: z.boolean() }).nullable(),
});
class SupportError extends Error {}
function result(data: Record<string, unknown>, isError = false): ToolHandlerResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data,
    ...(isError ? { isError: true } : {}) };
}
function parse<S extends z.ZodTypeAny>(schema: S, input: unknown, code: string): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new SupportError(code);
  return parsed.data;
}
function userClient(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new SupportError("configuration_unavailable");
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false } });
}
function caller(ctx: SupportContext, factory: SupportClientFactory): SupabaseClient {
  if (!ctx.isAuthenticated() || !ctx.getToken()) throw new SupportError("unauthorized");
  return factory(ctx.getToken()!);
}
const errors = new Set(["platform_admin_required", "invalid_support_request", "invalid_support_cursor", "support_item_unavailable"]);
async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown>) {
  const response = await db.rpc(name, args);
  if (response.error) throw new SupportError(errors.has(response.error.message) ? response.error.message : "support_unavailable");
  return response.data;
}
function failure(error: unknown) {
  return result({ error: error instanceof SupportError ? error.message : "support_unavailable" }, true);
}
function encodeCursor(scope: string, position: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, scope, position }));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeCursor<S extends z.ZodTypeAny>(value: string | undefined, scope: string, schema: S): z.output<S> | null {
  if (!value) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
    const envelope = z.object({ v: z.literal(1), scope: z.literal(scope), position: schema }).strict().parse(decoded);
    return envelope.position;
  } catch { throw new SupportError("invalid_support_cursor"); }
}
function searchScope(input: z.infer<typeof searchInput>) {
  return JSON.stringify([input.source_kind, input.query ?? null, input.status ?? null,
    input.organization_id ?? null, input.user_id ?? null, input.updated_since ?? null]);
}
/** Both RPCs are read-only SECURITY INVOKER and enforce active admin rights plus caller RLS. */
export async function searchSintagmaSupportRequests(input: unknown, ctx: SupportContext,
  factory: SupportClientFactory = userClient): Promise<ToolHandlerResult> {
  try {
    const request = parse(searchInput, input, "invalid_input");
    const db = caller(ctx, factory);
    const scope = searchScope(request);
    const before = decodeCursor(request.cursor, scope, listPosition);
    const data = parse(searchOutput, await rpc(db, "sintagma_support_search", {
      p_source_kind: request.source_kind, p_query: request.query ?? null, p_status: request.status ?? null,
      p_organization_id: request.organization_id ?? null, p_user_id: request.user_id ?? null,
      p_updated_since: request.updated_since ?? null,
      p_before_created_at: before?.created_at ?? null, p_before_kind: before?.source_kind ?? null,
      p_before_id: before?.source_id ?? null, p_limit: request.limit,
    }), "invalid_support_response");
    if (data.items.length > request.limit || data.has_more !== (data.next_cursor !== null)
      || data.items.some(row => request.source_kind !== "all" && row.source_kind !== request.source_kind
        || request.organization_id && row.organization_id !== request.organization_id
        || request.user_id && row.user_id !== request.user_id
        || request.status && row.status !== request.status)) throw new SupportError("support_scope_mismatch");
    const last = data.items.at(-1);
    if (data.next_cursor && (!last || data.next_cursor.source_id !== last.source_id
      || data.next_cursor.source_kind !== last.source_kind || data.next_cursor.created_at !== last.created_at))
      throw new SupportError("invalid_support_response");
    return result({ ...data, next_cursor: data.next_cursor ? encodeCursor(scope, data.next_cursor) : null,
      content_is_untrusted: true, read_only: true,
      sources: ["platform_chat", "problem_report"],
      pagination_note: "Creation order is stable; use updated_since to discover activity in older conversations. Unread counters do not prove whether a request was handled." });
  } catch (error) { return failure(error); }
}
export async function getSintagmaSupportRequest(input: unknown, ctx: SupportContext,
  factory: SupportClientFactory = userClient): Promise<ToolHandlerResult> {
  try {
    const request = parse(detailInput, input, "invalid_input");
    const db = caller(ctx, factory);
    const scope = JSON.stringify([request.source_kind, request.source_id]);
    const after = decodeCursor(request.message_cursor, scope, messagePosition);
    if (request.source_kind === "problem_report" && after) throw new SupportError("invalid_support_cursor");
    const data = parse(detailOutput, await rpc(db, "sintagma_support_detail", {
      p_source_kind: request.source_kind, p_source_id: request.source_id,
      p_after_created_at: after?.created_at ?? null, p_after_id: after?.id ?? null,
      p_message_limit: request.message_limit,
    }), "invalid_support_response");
    if (data.item.source_kind !== request.source_kind || data.item.source_id !== request.source_id
      || data.messages.length > request.message_limit || data.has_more_messages !== (data.next_message_cursor !== null)
      || request.source_kind === "platform_chat" && data.report !== null
      || request.source_kind === "problem_report" && (data.report === null || data.messages.length || data.has_more_messages))
      throw new SupportError("support_scope_mismatch");
    const last = data.messages.at(-1);
    if (data.next_message_cursor && (!last || data.next_message_cursor.id !== last.id
      || data.next_message_cursor.created_at !== last.created_at)) throw new SupportError("invalid_support_response");
    return result({ ...data, next_message_cursor: data.next_message_cursor ? encodeCursor(scope, data.next_message_cursor) : null,
      content_is_untrusted: true, read_only: true,
      diagnostics_note: "Raw browser/error logs and screenshot URLs are omitted; page URL has no query or fragment. Reading does not mark messages as read or send a reply." });
  } catch (error) { return failure(error); }
}
