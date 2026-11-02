import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext, ToolHandlerResult } from "@lovable.dev/mcp-js";
import { z } from "zod";

export type PostpaidContext = Pick<ToolContext, "isAuthenticated" | "getToken">;
export type PostpaidClientFactory = (token: string) => SupabaseClient;

const uuid = z.string().uuid();
const count = z.number().int().nonnegative().max(2147483647);
const plan = z.enum(["start", "standard", "professional"]);
const sourceHash = z.string().regex(/^[a-f0-9]{32}$/);
const amount = z.number().finite().positive().max(16990)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, "Amount must use whole kopecks");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const month = date.refine(value => value.endsWith("-01"));
const timestamp = z.string().datetime({ offset: true });
const featureFlags = z.object({ crm: z.boolean(), webinar: z.boolean(), videoserviceplus: z.boolean(), frdoplus: z.boolean() });

export const postpaidOverviewShape = {
  organization_id: uuid,
  period_start: month.optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).max(10000).default(0),
};
export const previewPostpaidStatementShape = { organization_id: uuid, statement_id: uuid };
export const preparePostpaidStatementShape = { organization_id: uuid, period_start: month };
export const issuePostpaidInvoiceShape = {
  ...previewPostpaidStatementShape,
  expected_source_hash: sourceHash,
  expected_amount: amount,
  expected_plan: plan,
  expected_review_hash: sourceHash,
};
export const approvePostpaidStatementShape = {
  ...previewPostpaidStatementShape,
  expected_source_hash: sourceHash,
  expected_amount: amount,
  expected_plan: plan,
  courses: count,
  learners: count,
  review_note: z.string().trim().min(10).max(4000),
};

const overviewInput = z.object(postpaidOverviewShape).strict();
const previewInput = z.object(previewPostpaidStatementShape).strict();
const prepareInput = z.object(preparePostpaidStatementShape).strict();
const issueInput = z.object(issuePostpaidInvoiceShape).strict();
const approveInput = z.object(approvePostpaidStatementShape).strict();

const agreementSchema = z.object({
  id: uuid, organization_id: uuid, billing_mode: z.literal("postpaid"),
  effective_from: date, effective_to: date.nullable(), contract_reference: z.string(),
  terms_version: z.string(), contract_through: date, annual_renewal: z.boolean(),
  billing_timezone: z.string(), recording_started_at: timestamp,
});
const snapshotSchema = z.object({
  courses_count: count, learners_count: count, ledger_courses_count: count, ledger_learners_count: count,
  features: featureFlags, completeness: z.object({ status: z.enum(["recorded", "requires_manual_review"]), reasons: z.array(z.string()) }),
  access_days: count, month_days: z.number().int().min(28).max(31),
  access_period_start: date, access_period_end: date, period_closed: z.boolean(),
  terms_version: z.string(), additional_services_included: z.boolean(),
});
const statementSchema = z.object({
  id: uuid, organization_id: uuid, agreement_id: uuid, period_start: month, period_end: month,
  revision: z.number().int().positive(), status: z.enum(["needs_review", "approved", "invoiced", "superseded"]),
  source_hash: sourceHash, plan, amount, snapshot: snapshotSchema,
  reviewed_courses: count.nullable(), reviewed_learners: count.nullable(), reviewed_at: timestamp.nullable(),
  invoice_id: uuid.nullable(), created_at: timestamp,
});
const overviewSchema = z.object({ agreement: agreementSchema.nullable(), statements: z.array(statementSchema) });

const checkedStatementSchema = statementSchema.omit({ agreement_id: true, snapshot: true, created_at: true })
  .extend({ review_hash: sourceHash.nullable() })
  .refine(row => row.status !== "invoiced" || row.invoice_id !== null, "Issued statement requires its invoice identity");
const quoteSchema = z.object({ plan, monthly_amount: amount, amount });
const currentSchema = snapshotSchema.omit({ terms_version: true, additional_services_included: true })
  .extend({ source_hash: sourceHash, contract_reference: z.string(), terms_version: z.string(), quote: quoteSchema });
const previewSchema = z.discriminatedUnion("already_issued", [
  z.object({ organization_id: uuid, statement: checkedStatementSchema, current: currentSchema,
    fresh: z.boolean(), already_issued: z.literal(false) }),
  z.object({ organization_id: uuid, statement: checkedStatementSchema, current: z.null(),
    fresh: z.null(), already_issued: z.literal(true) }),
]);
const approvalSchema = z.object({
  organization_id: uuid, statement: checkedStatementSchema, already_approved: z.boolean(), already_issued: z.boolean(),
});
const invoiceSchema = z.object({
  organization_id: uuid, statement_id: uuid, source_hash: sourceHash, review_hash: sourceHash,
  invoice_id: uuid, invoice_number: z.string().min(1), invoice_date: date,
  period_start: month, period_end: month, plan, amount, currency: z.literal("RUB"),
  payment_status: z.string(), paid_at: timestamp.nullable(), already_issued: z.boolean(),
});

class BillingError extends Error {
  constructor(message: string, readonly confirmedRejected = false) { super(message); }
}
const databaseErrors: Record<string, string> = {
  "42501": "platform_admin_required", "22023": "invalid_postpaid_request", P0002: "postpaid_statement_unavailable",
  "40001": "postpaid_conflict", "55000": "postpaid_state_conflict", P0001: "postpaid_postcondition_failed",
};

function result(data: Record<string, unknown>, isError = false): ToolHandlerResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data,
    ...(isError ? { isError: true } : {}) };
}
function failure(error: unknown, writeAttempted: boolean): ToolHandlerResult {
  const code = error instanceof BillingError ? error.message : "postpaid_billing_unavailable";
  const uncertain = writeAttempted && !(error instanceof BillingError && error.confirmedRejected);
  return result({ error: code, ...(uncertain ? {
    operation_may_have_committed: true,
    next_action: "Read the same statement and invoice before retrying; do not create another invoice.",
  } : {}) }, true);
}
function parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown, code: string): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BillingError(code);
  return parsed.data;
}
function userClient(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !publicKey) throw new BillingError("configuration_unavailable");
  return createClient(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function caller(ctx: PostpaidContext, factory: PostpaidClientFactory): SupabaseClient {
  if (!ctx.isAuthenticated() || !ctx.getToken()) throw new BillingError("unauthorized");
  return factory(ctx.getToken()!);
}
async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await db.rpc(name, args);
  if (response.error) {
    const code = response.error.code ?? "";
    // Unknown SQLSTATEs include connection/transaction-resolution failures. They
    // are not evidence that an attempted financial write was rolled back.
    throw new BillingError(databaseErrors[code] ?? "postpaid_billing_unavailable",
      Object.prototype.hasOwnProperty.call(databaseErrors, code));
  }
  return response.data;
}

/** Existing administrator RPC remains the authority; actor IDs and private evidence are omitted. */
export async function getSintagmaPostpaidBillingOverview(input: unknown, ctx: PostpaidContext,
  factory: PostpaidClientFactory = userClient): Promise<ToolHandlerResult> {
  try {
    const scope = parse(overviewInput, input, "invalid_input");
    const db = caller(ctx, factory);
    const response = parse(overviewSchema, await rpc(db, "get_postpaid_billing_overview", {
      p_organization_id: scope.organization_id,
    }), "invalid_billing_response");
    if (response.agreement && response.agreement.organization_id !== scope.organization_id
      || response.statements.some(row => row.organization_id !== scope.organization_id))
      throw new BillingError("source_scope_mismatch");
    const statements = response.statements.filter(row => !scope.period_start || row.period_start === scope.period_start)
      .sort((a, b) => b.period_start.localeCompare(a.period_start) || b.revision - a.revision || a.id.localeCompare(b.id));
    return result({ status: "overview", organization_id: scope.organization_id, agreement: response.agreement,
      statements: statements.slice(scope.offset, scope.offset + scope.limit),
      next_offset: statements.length > scope.offset + scope.limit ? scope.offset + scope.limit : null });
  } catch (error) { return failure(error, false); }
}

/** Prepare/reuse the native draft only after its Moscow calendar month has closed. */
export async function prepareSintagmaPostpaidStatement(input: unknown, ctx: PostpaidContext,
  factory: PostpaidClientFactory = userClient, now: () => Date = () => new Date()): Promise<ToolHandlerResult> {
  let writeAttempted = false;
  try {
    const scope = parse(prepareInput, input, "invalid_input");
    const db = caller(ctx, factory);
    const instant = now();
    if (!Number.isFinite(instant.getTime())) throw new BillingError("configuration_unavailable");
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit" })
      .formatToParts(instant);
    const currentMonth = `${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}-01`;
    if (!/^\d{4}-\d{2}-01$/.test(currentMonth)) throw new BillingError("configuration_unavailable");
    if (scope.period_start >= currentMonth) throw new BillingError("postpaid_period_open");
    writeAttempted = true;
    const statement = parse(statementSchema, await rpc(db, "prepare_postpaid_statement", {
      p_organization_id: scope.organization_id, p_period_start: scope.period_start,
    }), "invalid_billing_response");
    if (statement.organization_id !== scope.organization_id || statement.period_start !== scope.period_start
      || statement.status === "superseded" || !statement.snapshot.period_closed)
      throw new BillingError("invalid_billing_response");
    return result({ status: "prepared", organization_id: scope.organization_id, statement });
  } catch (error) { return failure(error, writeAttempted); }
}

function assertStatementScope(statement: z.infer<typeof checkedStatementSchema>, scope: z.infer<typeof previewInput>) {
  if (statement.id !== scope.statement_id || statement.organization_id !== scope.organization_id)
    throw new BillingError("source_scope_mismatch");
}

/** Read the native checked preview; no attempt is made to reconstruct a price or current usage here. */
export async function previewSintagmaPostpaidStatement(input: unknown, ctx: PostpaidContext,
  factory: PostpaidClientFactory = userClient): Promise<ToolHandlerResult> {
  try {
    const scope = parse(previewInput, input, "invalid_input");
    const db = caller(ctx, factory);
    const preview = parse(previewSchema, await rpc(db, "preview_postpaid_statement_checked", {
      p_organization_id: scope.organization_id, p_statement_id: scope.statement_id,
    }), "invalid_billing_response");
    assertStatementScope(preview.statement, scope);
    if (preview.organization_id !== scope.organization_id
      || preview.already_issued !== (preview.statement.status === "invoiced"))
      throw new BillingError("source_scope_mismatch");
    return result({ status: "preview", ...preview });
  } catch (error) { return failure(error, false); }
}

/** The database verifies quote, usage and tenant atomically before calling the original administrator RPC. */
export async function approveSintagmaPostpaidStatement(input: unknown, ctx: PostpaidContext,
  factory: PostpaidClientFactory = userClient): Promise<ToolHandlerResult> {
  let writeAttempted = false;
  try {
    const scope = parse(approveInput, input, "invalid_input");
    const db = caller(ctx, factory);
    writeAttempted = true;
    const approval = parse(approvalSchema, await rpc(db, "approve_postpaid_statement_checked", {
      p_organization_id: scope.organization_id, p_statement_id: scope.statement_id,
      p_expected_source_hash: scope.expected_source_hash, p_expected_amount: scope.expected_amount,
      p_expected_plan: scope.expected_plan, p_courses: scope.courses, p_learners: scope.learners,
      p_review_note: scope.review_note,
    }), "invalid_billing_response");
    assertStatementScope(approval.statement, scope);
    const row = approval.statement;
    if (approval.organization_id !== scope.organization_id || row.source_hash !== scope.expected_source_hash
      || row.plan !== scope.expected_plan || row.amount !== scope.expected_amount
      || row.reviewed_courses !== scope.courses || row.reviewed_learners !== scope.learners
      || !row.review_hash || !row.reviewed_at || !["approved", "invoiced"].includes(row.status)
      || approval.already_issued !== (row.status === "invoiced"))
      throw new BillingError("invalid_billing_response");
    return result({ status: row.status, ...approval });
  } catch (error) { return failure(error, writeAttempted); }
}

/** Issue/reuse exactly the approved native invoice; never send it, mark it paid or activate a prepaid term. */
export async function issueSintagmaPostpaidInvoice(input: unknown, ctx: PostpaidContext,
  factory: PostpaidClientFactory = userClient): Promise<ToolHandlerResult> {
  let writeAttempted = false;
  try {
    const scope = parse(issueInput, input, "invalid_input");
    const db = caller(ctx, factory);
    writeAttempted = true;
    const invoice = parse(invoiceSchema, await rpc(db, "issue_postpaid_invoice_checked", {
      p_organization_id: scope.organization_id, p_statement_id: scope.statement_id,
      p_expected_source_hash: scope.expected_source_hash, p_expected_amount: scope.expected_amount,
      p_expected_plan: scope.expected_plan, p_expected_review_hash: scope.expected_review_hash,
    }), "invalid_billing_response");
    if (invoice.organization_id !== scope.organization_id || invoice.statement_id !== scope.statement_id
      || invoice.source_hash !== scope.expected_source_hash || invoice.review_hash !== scope.expected_review_hash
      || invoice.amount !== scope.expected_amount || invoice.plan !== scope.expected_plan)
      throw new BillingError("invalid_billing_response");
    return result({ status: "invoiced", ...invoice });
  } catch (error) { return failure(error, writeAttempted); }
}
