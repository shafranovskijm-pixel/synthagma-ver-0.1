import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { approveSintagmaPostpaidStatement, getSintagmaPostpaidBillingOverview, issueSintagmaPostpaidInvoice,
  prepareSintagmaPostpaidStatement, previewSintagmaPostpaidStatement, type PostpaidContext } from "./postpaid-billing";
import overviewTool from "./tools/get-sintagma-postpaid-billing-overview";
import prepareTool from "./tools/prepare-sintagma-postpaid-statement";
import previewTool from "./tools/preview-sintagma-postpaid-statement";
import approveTool from "./tools/approve-sintagma-postpaid-statement";
import issueTool from "./tools/issue-sintagma-postpaid-invoice";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
const ORG = "10000000-0000-4000-8000-000000000001";
const OTHER = "90000000-0000-4000-8000-000000000001";
const STATEMENT = "20000000-0000-4000-8000-000000000001";
const AGREEMENT = "30000000-0000-4000-8000-000000000001";
const INVOICE = "40000000-0000-4000-8000-000000000001";
const SOURCE = "a".repeat(32);
const REVIEW = "b".repeat(32);
const ctx: PostpaidContext = { isAuthenticated: () => true, getToken: () => "normal-caller-jwt" };
const clock = () => new Date("2026-11-02T01:00:00Z");
const scope = { organization_id: ORG, statement_id: STATEMENT };
const prepareScope = { organization_id: ORG, period_start: "2026-10-01" };
const approvalInput = { ...scope, expected_source_hash: SOURCE, expected_amount: 6990,
  expected_plan: "standard", courses: 22, learners: 119, review_note: "Reconciled source facts for the closed month." };
const issueInput = { ...scope, expected_source_hash: SOURCE, expected_amount: 6990,
  expected_plan: "standard", expected_review_hash: REVIEW };
const features = { crm: false, webinar: false, videoserviceplus: false, frdoplus: false };
const snapshot = { courses_count: 22, learners_count: 119, ledger_courses_count: 21, ledger_learners_count: 62,
  features, completeness: { status: "requires_manual_review", reasons: ["retrospective_history_incomplete"] },
  access_days: 31, month_days: 31, access_period_start: "2026-10-01", access_period_end: "2026-11-01",
  period_closed: true, terms_version: "59-09-26-v1", additional_services_included: false,
  feature_evidence: [{ private_customer_evidence: "never-return" }] };
const agreement = { id: AGREEMENT, organization_id: ORG, billing_mode: "postpaid", effective_from: "2026-10-01",
  effective_to: null, contract_reference: "Contract 59-09/26", terms_version: "59-09-26-v1", contract_through: "2026-12-31",
  annual_renewal: true, billing_timezone: "Europe/Moscow", recording_started_at: "2026-10-16T15:40:12Z",
  created_by: OTHER, customer_confirmation: "never-return-private-confirmation" };
const statement = { id: STATEMENT, organization_id: ORG, agreement_id: AGREEMENT,
  period_start: "2026-10-01", period_end: "2026-11-01", revision: 2, status: "needs_review", source_hash: SOURCE,
  plan: "standard", amount: 6990, snapshot, reviewed_courses: null, reviewed_learners: null,
  reviewed_at: null, invoice_id: null, created_at: "2026-11-01T09:00:03Z",
  reviewed_by: OTHER, review_note: "never-return-private-review" };
const approved = { ...statement, status: "approved", reviewed_courses: 22, reviewed_learners: 119,
  reviewed_at: "2026-11-02T01:00:00Z", review_hash: REVIEW };
const preview = { organization_id: ORG, statement: { ...statement, review_hash: null },
  current: { ...snapshot, source_hash: SOURCE, contract_reference: "Contract 59-09/26",
    quote: { plan: "standard", monthly_amount: 6990, amount: 6990 } }, fresh: true, already_issued: false };
const invoice = { organization_id: ORG, statement_id: STATEMENT, source_hash: SOURCE, review_hash: REVIEW,
  invoice_id: INVOICE, invoice_number: "ПП-202610-fixture", invoice_date: "2026-11-02",
  period_start: "2026-10-01", period_end: "2026-11-01", plan: "standard", amount: 6990,
  currency: "RUB", payment_status: "pending", paid_at: null, already_issued: false,
  terminal_key: "never-return-terminal", generated_password: "never-return-password" };
type RecordValue = Record<string, unknown>;
const content = (response: Awaited<ReturnType<typeof previewSintagmaPostpaidStatement>>) => response.structuredContent! as RecordValue;
function fake(options: { error?: { code?: string; message: string }; throws?: boolean;
  overrides?: Record<string, unknown> } = {}) {
  const replies: Record<string, unknown> = {
    get_postpaid_billing_overview: { agreement, statements: [statement], feature_confirmations: ["never-return"] },
    prepare_postpaid_statement: statement,
    preview_postpaid_statement_checked: preview,
    approve_postpaid_statement_checked: { organization_id: ORG, statement: approved, already_approved: false, already_issued: false },
    issue_postpaid_invoice_checked: invoice,
    ...options.overrides,
  };
  const rpc = vi.fn(async (name: string, _args: RecordValue) => {
    if (options.throws) throw new Error("private transport details");
    if (options.error) return { data: null, error: options.error };
    if (!(name in replies)) throw new Error("unapproved RPC");
    return { data: replies[name], error: null };
  });
  const from = vi.fn(() => { throw new Error("Direct table access forbidden"); });
  const db = { rpc, from } as unknown as SupabaseClient;
  const factory = vi.fn(() => db);
  return { rpc, from, factory, db, replies };
}
const operations = [
  { run: getSintagmaPostpaidBillingOverview, input: { organization_id: ORG } },
  { run: prepareSintagmaPostpaidStatement, input: prepareScope },
  { run: previewSintagmaPostpaidStatement, input: scope },
  { run: approveSintagmaPostpaidStatement, input: approvalInput },
  { run: issueSintagmaPostpaidInvoice, input: issueInput },
];
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); })); vi.useFakeTimers(); vi.setSystemTime(clock()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("postpaid caller and input boundary", () => {
  it("denies unauthenticated callers before constructing any database client", async () => {
    const f = fake();
    for (const { run, input } of operations) expect(content(await run(input, { ...ctx, isAuthenticated: () => false }, f.factory)).error).toBe("unauthorized");
    expect(f.factory).not.toHaveBeenCalled();
  });
  it("requires the authenticated caller token and never substitutes a service credential", async () => {
    const f = fake();
    for (const { run, input } of operations) expect(content(await run(input, { ...ctx, getToken: () => "" }, f.factory)).error).toBe("unauthorized");
    expect(f.factory).not.toHaveBeenCalled();
  });
  it("rejects extra SQL/auth/actor fields and invalid identifiers before database access", async () => {
    const f = fake();
    for (const { run, input } of operations) {
      expect(content(await run({ ...input, sql: "UPDATE", role: "service_role" }, ctx, f.factory)).error).toBe("invalid_input");
      expect(content(await run({ ...input, organization_id: "*" }, ctx, f.factory)).error).toBe("invalid_input");
    }
    expect(f.factory).not.toHaveBeenCalled();
  });
  it("validates first-day calendar months, pagination and input shapes", async () => {
    const f = fake();
    for (const period_start of ["2026-02-30", "2026-10-02", "2026-13-01"]) {
      expect(content(await prepareSintagmaPostpaidStatement({ ...prepareScope, period_start }, ctx, f.factory)).error).toBe("invalid_input");
      expect(content(await getSintagmaPostpaidBillingOverview({ organization_id: ORG, period_start }, ctx, f.factory)).error).toBe("invalid_input");
    }
    for (const limit of [0, 51, 1.5]) expect(content(await getSintagmaPostpaidBillingOverview({ organization_id: ORG, limit }, ctx, f.factory)).error).toBe("invalid_input");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("requires a monetary intent in whole kopecks and bounded explicit reviewed counts", async () => {
    const f = fake();
    for (const expected_amount of [0, -1, 16990.01, 6990.001, Number.NaN]) {
      expect(content(await approveSintagmaPostpaidStatement({ ...approvalInput, expected_amount }, ctx, f.factory)).error).toBe("invalid_input");
      expect(content(await issueSintagmaPostpaidInvoice({ ...issueInput, expected_amount }, ctx, f.factory)).error).toBe("invalid_input");
    }
    for (const changes of [{ courses: -1 }, { learners: 1.5 }, { courses: "22" }, { review_note: "short" }])
      expect(content(await approveSintagmaPostpaidStatement({ ...approvalInput, ...changes }, ctx, f.factory)).error).toBe("invalid_input");
    expect(f.factory).not.toHaveBeenCalled();
  });
  it("requires the exact reviewed hash on issuance and syntactically valid source hashes", async () => {
    const f = fake();
    for (const changes of [{ expected_review_hash: undefined }, { expected_review_hash: "x".repeat(32) }, { expected_source_hash: "a".repeat(64) }])
      expect(content(await issueSintagmaPostpaidInvoice({ ...issueInput, ...changes }, ctx, f.factory)).error).toBe("invalid_input");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("constructs a stateless normal caller client from the publishable key", async () => {
    const f = fake();
    vi.stubEnv("SUPABASE_URL", "https://example.invalid"); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "public-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-use");
    vi.mocked(createClient).mockReturnValue(f.db as ReturnType<typeof createClient>);
    await getSintagmaPostpaidBillingOverview({ organization_id: ORG }, ctx);
    expect(createClient).toHaveBeenCalledWith("https://example.invalid", "public-key", {
      global: { headers: { Authorization: "Bearer normal-caller-jwt" } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("supports the public anon key while keeping the actual caller authorization", async () => {
    const f = fake();
    vi.stubEnv("SUPABASE_URL", "https://example.invalid"); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("SUPABASE_ANON_KEY", "public-anon-key"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-use");
    vi.mocked(createClient).mockReturnValue(f.db as ReturnType<typeof createClient>);
    await previewSintagmaPostpaidStatement(scope, ctx);
    expect(createClient).toHaveBeenCalledWith("https://example.invalid", "public-anon-key", expect.objectContaining({
      global: { headers: { Authorization: "Bearer normal-caller-jwt" } },
    }));
  });
  it("fails closed when normal configuration is absent, without trying a service key", async () => {
    vi.stubEnv("SUPABASE_URL", undefined); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("SUPABASE_ANON_KEY", undefined); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-use");
    expect(content(await issueSintagmaPostpaidInvoice(issueInput, ctx))).toEqual({ error: "configuration_unavailable" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("safe overview and closed-month draft", () => {
  it("omits private review, actor, feature and confirmation payloads", async () => {
    const f = fake(); const response = content(await getSintagmaPostpaidBillingOverview({ organization_id: ORG }, ctx, f.factory));
    expect(response.status).toBe("overview"); expect(response.statements).toHaveLength(1);
    expect(JSON.stringify(response)).not.toMatch(/never-return|created_by|reviewed_by|review_note|feature_evidence|feature_confirmations|customer_confirmation/);
    expect(f.rpc).toHaveBeenCalledWith("get_postpaid_billing_overview", { p_organization_id: ORG });
  });
  it("sorts and paginates saved revisions within an optional exact month", async () => {
    const f = fake({ overrides: { get_postpaid_billing_overview: { agreement, statements: [
      { ...statement, revision: 1, id: OTHER }, { ...statement, period_start: "2026-09-01", period_end: "2026-10-01" }, statement,
    ] } } });
    const response = content(await getSintagmaPostpaidBillingOverview({ organization_id: ORG, period_start: "2026-10-01", offset: 1, limit: 1 }, ctx, f.factory));
    expect(response.statements).toMatchObject([{ id: OTHER, revision: 1 }]); expect(response.next_offset).toBeNull();
  });
  it("rejects a foreign agreement or statement instead of leaking or silently hiding it", async () => {
    for (const foreign of [{ agreement: { ...agreement, organization_id: OTHER }, statements: [statement] },
      { agreement, statements: [{ ...statement, organization_id: OTHER }] }]) {
      const f = fake({ overrides: { get_postpaid_billing_overview: foreign } });
      expect(content(await getSintagmaPostpaidBillingOverview({ organization_id: ORG }, ctx, f.factory)).error).toBe("source_scope_mismatch");
    }
  });
  it("uses Moscow month closure at the UTC boundary without changing local system timezone", async () => {
    const f = fake();
    expect(content(await prepareSintagmaPostpaidStatement(prepareScope, ctx, f.factory,
      () => new Date("2026-10-31T20:59:59Z")))).toEqual({ error: "postpaid_period_open" });
    expect(f.rpc).not.toHaveBeenCalled();
    expect(content(await prepareSintagmaPostpaidStatement(prepareScope, ctx, f.factory,
      () => new Date("2026-10-31T21:00:00Z"))).status).toBe("prepared");
    expect(f.rpc).toHaveBeenCalledWith("prepare_postpaid_statement", { p_organization_id: ORG, p_period_start: "2026-10-01" });
  });
  it("does not prepare current/future months and fails closed on an invalid clock", async () => {
    const f = fake();
    for (const period_start of ["2026-11-01", "2026-12-01"]) expect(content(await prepareSintagmaPostpaidStatement({ ...prepareScope, period_start }, ctx, f.factory, clock)).error).toBe("postpaid_period_open");
    expect(content(await prepareSintagmaPostpaidStatement(prepareScope, ctx, f.factory, () => new Date("invalid"))).error).toBe("configuration_unavailable");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("can reuse an already invoiced draft without running approval or issuance", async () => {
    const f = fake({ overrides: { prepare_postpaid_statement: { ...approved, status: "invoiced", invoice_id: INVOICE } } });
    const response = content(await prepareSintagmaPostpaidStatement(prepareScope, ctx, f.factory, clock));
    expect(response.statement).toMatchObject({ invoice_id: INVOICE, status: "invoiced" });
    expect(f.rpc.mock.calls.map(call => call[0])).toEqual(["prepare_postpaid_statement"]);
  });
  it("does not claim a successful prepare when its returned scope or month is wrong", async () => {
    const f = fake({ overrides: { prepare_postpaid_statement: { ...statement, organization_id: OTHER } } });
    expect(content(await prepareSintagmaPostpaidStatement(prepareScope, ctx, f.factory, clock))).toMatchObject({ error: "invalid_billing_response", operation_may_have_committed: true });
  });
});

describe("checked preview and native review", () => {
  it("returns exact server quote and retrospective qualifications without local price inference", async () => {
    const f = fake(); const response = content(await previewSintagmaPostpaidStatement(scope, ctx, f.factory));
    expect(response).toMatchObject({ status: "preview", fresh: true, already_issued: false,
      current: { quote: { plan: "standard", amount: 6990 }, completeness: { status: "requires_manual_review" } } });
    expect(JSON.stringify(response)).not.toMatch(/never-return|reviewed_by|review_note|feature_evidence/);
    expect(f.rpc.mock.calls.map(call => call[0])).toEqual(["preview_postpaid_statement_checked"]);
  });
  it("reads issued history without depending on today's agreement or usage collector", async () => {
    const f = fake({ overrides: { preview_postpaid_statement_checked: { ...preview, fresh: null, already_issued: true,
      statement: { ...approved, status: "invoiced", invoice_id: INVOICE }, current: null } } });
    expect(content(await previewSintagmaPostpaidStatement(scope, ctx, f.factory))).toMatchObject({ fresh: null, already_issued: true,
      statement: { amount: 6990, review_hash: REVIEW }, current: null });
    expect(f.rpc.mock.calls.map(call => call[0])).toEqual(["preview_postpaid_statement_checked"]);
  });
  it("rejects inconsistent preview identity or issued-state flags", async () => {
    for (const changes of [{ organization_id: OTHER }, { statement: { ...statement, review_hash: null, id: OTHER } }]) {
      const f = fake({ overrides: { preview_postpaid_statement_checked: { ...preview, ...changes } } });
      expect(content(await previewSintagmaPostpaidStatement(scope, ctx, f.factory)).error).toBe("source_scope_mismatch");
    }
    const f = fake({ overrides: { preview_postpaid_statement_checked: { ...preview, already_issued: true } } });
    expect(content(await previewSintagmaPostpaidStatement(scope, ctx, f.factory)).error).toBe("invalid_billing_response");
  });
  it("passes only the checked approval contract and trims the written review", async () => {
    const f = fake(); const response = content(await approveSintagmaPostpaidStatement({ ...approvalInput, review_note: `  ${approvalInput.review_note}  ` }, ctx, f.factory));
    expect(response).toMatchObject({ status: "approved", already_approved: false, statement: { review_hash: REVIEW, reviewed_courses: 22, reviewed_learners: 119 } });
    expect(f.rpc).toHaveBeenCalledWith("approve_postpaid_statement_checked", {
      p_organization_id: ORG, p_statement_id: STATEMENT, p_expected_source_hash: SOURCE, p_expected_amount: 6990,
      p_expected_plan: "standard", p_courses: 22, p_learners: 119, p_review_note: approvalInput.review_note,
    });
    expect(JSON.stringify(response)).not.toMatch(/never-return|reviewed_by|review_note/); expect(f.from).not.toHaveBeenCalled();
  });
  it("returns the backend's exact approval replay without calling an unchecked writer", async () => {
    const f = fake({ overrides: { approve_postpaid_statement_checked: { organization_id: ORG, statement: approved, already_approved: true, already_issued: false } } });
    expect(content(await approveSintagmaPostpaidStatement(approvalInput, ctx, f.factory))).toMatchObject({ already_approved: true, statement: { review_hash: REVIEW } });
    expect(f.rpc.mock.calls.map(call => call[0])).toEqual(["approve_postpaid_statement_checked"]);
  });
  it("can reread an identical review of an issued invoice without a second issue operation", async () => {
    const f = fake({ overrides: { approve_postpaid_statement_checked: { organization_id: ORG,
      statement: { ...approved, status: "invoiced", invoice_id: INVOICE }, already_approved: true, already_issued: true } } });
    expect(content(await approveSintagmaPostpaidStatement(approvalInput, ctx, f.factory))).toMatchObject({ status: "invoiced", already_issued: true });
    expect(f.rpc.mock.calls.map(call => call[0])).toEqual(["approve_postpaid_statement_checked"]);
  });
  it("does not report approval if the successful response changes the requested money or counts", async () => {
    for (const changes of [{ amount: 16990 }, { reviewed_learners: 1 }, { source_hash: "c".repeat(32) }, { review_hash: null },
      { status: "invoiced", invoice_id: null }]) {
      const f = fake({ overrides: { approve_postpaid_statement_checked: { organization_id: ORG,
        statement: { ...approved, ...changes }, already_approved: false, already_issued: false } } });
      expect(content(await approveSintagmaPostpaidStatement(approvalInput, ctx, f.factory))).toMatchObject({ error: "invalid_billing_response", operation_may_have_committed: true });
    }
  });
});

describe("invoice issuance, refusals and uncertain outcomes", () => {
  it("issues only through the checked native RPC with the exact approved review hash", async () => {
    const f = fake(); const response = content(await issueSintagmaPostpaidInvoice(issueInput, ctx, f.factory));
    expect(response).toMatchObject({ status: "invoiced", invoice_id: INVOICE, amount: 6990, payment_status: "pending", paid_at: null });
    expect(f.rpc).toHaveBeenCalledWith("issue_postpaid_invoice_checked", { p_organization_id: ORG, p_statement_id: STATEMENT,
      p_expected_source_hash: SOURCE, p_expected_amount: 6990, p_expected_plan: "standard", p_expected_review_hash: REVIEW });
    expect(JSON.stringify(response)).not.toMatch(/never-return|terminal_key|generated_password/); expect(f.from).not.toHaveBeenCalled();
  });
  it("preserves actual payment status on an issued replay without a payment or renewal write", async () => {
    const f = fake({ overrides: { issue_postpaid_invoice_checked: { ...invoice, already_issued: true, payment_status: "paid", paid_at: "2026-11-10T07:00:00Z" } } });
    expect(content(await issueSintagmaPostpaidInvoice(issueInput, ctx, f.factory))).toMatchObject({ already_issued: true, payment_status: "paid", paid_at: "2026-11-10T07:00:00Z" });
    expect(f.rpc.mock.calls.map(call => call[0])).toEqual(["issue_postpaid_invoice_checked"]);
  });
  it("honors authenticated native role, tenant, source, quote and review refusals without raw messages", async () => {
    for (const [code, expected] of [["42501", "platform_admin_required"], ["22023", "invalid_postpaid_request"],
      ["P0002", "postpaid_statement_unavailable"], ["40001", "postpaid_conflict"], ["55000", "postpaid_state_conflict"], ["P0001", "postpaid_postcondition_failed"]]) {
      const f = fake({ error: { code, message: "never-return-sensitive-database-detail" } });
      expect(content(await issueSintagmaPostpaidInvoice(issueInput, ctx, f.factory))).toEqual({ error: expected });
    }
  });
  it("does not claim invoice success after a malformed or mismatching receipt", async () => {
    for (const changes of [{ organization_id: OTHER }, { statement_id: OTHER }, { amount: 16990 }, { review_hash: "c".repeat(32) }, { invoice_id: undefined }]) {
      const f = fake({ overrides: { issue_postpaid_invoice_checked: { ...invoice, ...changes } } });
      expect(content(await issueSintagmaPostpaidInvoice(issueInput, ctx, f.factory))).toMatchObject({ error: "invalid_billing_response", operation_may_have_committed: true });
    }
  });
  it("marks a lost write response as uncertain and instructs rereading the same statement", async () => {
    const f = fake({ throws: true });
    const response = content(await issueSintagmaPostpaidInvoice(issueInput, ctx, f.factory));
    expect(response).toMatchObject({ error: "postpaid_billing_unavailable", operation_may_have_committed: true });
    expect(response.next_action).toContain("same statement"); expect(JSON.stringify(response)).not.toContain("private transport");
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not imply an uncertain write for read failures or rejected database transactions", async () => {
    const f = fake({ error: { code: "XX000", message: "private internal path" } });
    expect(content(await previewSintagmaPostpaidStatement(scope, ctx, f.factory))).toEqual({ error: "postpaid_billing_unavailable" });
    const rejected = fake({ error: { code: "22023", message: "private native rejection" } });
    expect(content(await issueSintagmaPostpaidInvoice(issueInput, ctx, rejected.factory))).toEqual({ error: "invalid_postpaid_request" });
  });
  it.each(["08007", "40003"])("keeps a %s completion-unknown financial response uncertain", async code => {
    const f = fake({ error: { code, message: "private transport or transaction details" } });
    const response = content(await issueSintagmaPostpaidInvoice(issueInput, ctx, f.factory));
    expect(response).toMatchObject({ error: "postpaid_billing_unavailable", operation_may_have_committed: true });
    expect(response.next_action).toContain("same statement");
    expect(JSON.stringify(response)).not.toContain("private transport");
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("registers five explicit tools with truthful read/write and no-email behavior", () => {
    expect([overviewTool.name, prepareTool.name, previewTool.name, approveTool.name, issueTool.name]).toEqual([
      "get_sintagma_postpaid_billing_overview", "prepare_sintagma_postpaid_statement", "preview_sintagma_postpaid_statement",
      "approve_sintagma_postpaid_statement", "issue_sintagma_postpaid_invoice",
    ]);
    expect(overviewTool.annotations?.readOnlyHint).toBe(true); expect(previewTool.annotations?.readOnlyHint).toBe(true);
    for (const tool of [prepareTool, approveTool, issueTool]) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    }
    expect(issueTool.description).toContain("не продлевает предоплатную подписку");
  });
});
