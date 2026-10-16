import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PostpaidFeature = "crm" | "webinar" | "videoserviceplus" | "frdoplus";
export type PostpaidPlan = "start" | "standard" | "professional";
export interface PostpaidAgreement {
  id: string;
  organization_id: string;
  effective_from: string;
  effective_to: string | null;
  contract_reference: string;
  customer_confirmation: string;
  terms_version: string;
  recording_started_at: string;
  contract_through: string;
  annual_renewal: boolean;
}
export interface PostpaidStatement {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  revision: number;
  status: "needs_review" | "approved" | "invoiced" | "superseded";
  plan: PostpaidPlan;
  amount: number;
  snapshot: {
    courses_count: number;
    learners_count: number;
    ledger_courses_count: number;
    ledger_learners_count: number;
    features: Record<PostpaidFeature, boolean>;
    completeness: { status: "requires_manual_review" | "recorded"; reasons: string[] };
    access_days: number;
    month_days: number;
    period_closed: boolean;
  };
  review_note: string | null;
  reviewed_courses: number | null;
  reviewed_learners: number | null;
  invoice_id: string | null;
}
export interface PostpaidFeatureRecord {
  id: string;
  organization_id: string;
  feature: PostpaidFeature;
  evidence: string;
  notified_at?: string;
  confirmed_at?: string;
  occurred_at?: string;
  effective_to?: string | null;
}
export interface PostpaidOverview {
  agreement: PostpaidAgreement | null;
  statements: PostpaidStatement[];
  feature_confirmations: PostpaidFeatureRecord[];
  feature_usage: PostpaidFeatureRecord[];
}
type RpcResult = { data: unknown; error: { message?: string } | null };
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult> }).rpc(name, args);
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const confirmedOrgRow = (value: unknown, organizationId: string) => isObject(value) && typeof value.id === "string" && value.id.length > 0 && value.organization_id === organizationId;
const isStatement = (value: unknown, organizationId: string): value is PostpaidStatement => {
  if (!confirmedOrgRow(value, organizationId)) return false;
  const row = value as Record<string, unknown>;
  const snapshot = row.snapshot;
  return typeof row.period_start === "string" && typeof row.period_end === "string"
    && ["needs_review", "approved", "invoiced", "superseded"].includes(String(row.status))
    && ["start", "standard", "professional"].includes(String(row.plan))
    && typeof row.amount === "number" && Number.isFinite(row.amount) && row.amount >= 0
    && isObject(snapshot) && isObject(snapshot.completeness)
    && ["requires_manual_review", "recorded"].includes(String(snapshot.completeness.status))
    && Array.isArray(snapshot.completeness.reasons) && isObject(snapshot.features)
    && ["courses_count", "learners_count", "ledger_courses_count", "ledger_learners_count", "access_days", "month_days"].every(key => typeof snapshot[key] === "number" && Number.isFinite(snapshot[key]) && snapshot[key] >= 0)
    && typeof snapshot.period_closed === "boolean";
};

async function call<T>(name: string, args: Record<string, unknown>, validate: (data: unknown) => boolean): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message || "Операция постоплаты не выполнена");
  if (!validate(data)) throw new Error("Сервер не подтвердил результат операции постоплаты. Обновите данные и проверьте состояние.");
  return data as T;
}

export function useOrgPostpaidBilling(organizationId: string) {
  const client = useQueryClient();
  const queryKey = ["orgPostpaidBilling", organizationId];
  const overview = useQuery({
    queryKey,
    enabled: !!organizationId,
    refetchOnWindowFocus: false,
    queryFn: () => call<PostpaidOverview>("get_postpaid_billing_overview", { p_organization_id: organizationId }, data =>
      isObject(data) && (data.agreement === null || confirmedOrgRow(data.agreement, organizationId))
      && Array.isArray(data.statements) && data.statements.every(item => isStatement(item, organizationId))
      && Array.isArray(data.feature_confirmations) && data.feature_confirmations.every(item => confirmedOrgRow(item, organizationId))
      && Array.isArray(data.feature_usage) && data.feature_usage.every(item => confirmedOrgRow(item, organizationId))),
  });
  const mutation = useMutation({
    mutationFn: (request: { name: string; args: Record<string, unknown>; validate: (data: unknown) => boolean }) => call<unknown>(request.name, request.args, request.validate),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey }),
        client.invalidateQueries({ queryKey: ["adminBilling"] }),
        client.invalidateQueries({ queryKey: ["postpaid-access", organizationId] }),
      ]);
    },
  });
  return {
    overview: overview.data,
    loading: overview.isLoading,
    error: overview.error,
    refresh: overview.refetch,
    pending: mutation.isPending,
    saveAgreement: (input: { effectiveFrom: string; effectiveTo: string | null; contractReference: string; customerConfirmation: string }) => mutation.mutateAsync({
      name: "save_postpaid_agreement",
      args: { p_organization_id: organizationId, p_effective_from: input.effectiveFrom, p_effective_to: input.effectiveTo, p_contract_reference: input.contractReference, p_customer_confirmation: input.customerConfirmation },
      validate: data => confirmedOrgRow(data, organizationId),
    }) as Promise<PostpaidAgreement>,
    prepare: (periodStart: string) => mutation.mutateAsync({
      name: "prepare_postpaid_statement", args: { p_organization_id: organizationId, p_period_start: periodStart },
      validate: data => isStatement(data, organizationId) && data.period_start === periodStart,
    }) as Promise<PostpaidStatement>,
    approve: (statementId: string, reviewNote: string, courses: number | null, learners: number | null) => mutation.mutateAsync({
      name: "approve_postpaid_statement", args: { p_statement_id: statementId, p_review_note: reviewNote, p_courses_override: courses, p_learners_override: learners },
      validate: data => isStatement(data, organizationId) && data.id === statementId && data.status === "approved",
    }) as Promise<PostpaidStatement>,
    issue: (statementId: string) => mutation.mutateAsync({
      name: "issue_postpaid_invoice", args: { p_statement_id: statementId },
      validate: data => isObject(data) && data.statement_id === statementId && typeof data.invoice_id === "string" && data.invoice_id.length > 0 && typeof data.already_issued === "boolean",
    }) as Promise<{ invoice_id: string; statement_id: string; already_issued: boolean }>,
    confirmFeature: (input: { feature: PostpaidFeature; notifiedAt: string; confirmedAt: string; evidence: string }) => mutation.mutateAsync({
      name: "record_postpaid_feature_confirmation", args: { p_organization_id: organizationId, p_feature: input.feature, p_notified_at: input.notifiedAt, p_confirmed_at: input.confirmedAt, p_evidence: input.evidence, p_effective_to: null },
      validate: data => confirmedOrgRow(data, organizationId) && (data as Record<string, unknown>).feature === input.feature,
    }) as Promise<PostpaidFeatureRecord>,
    recordFeatureUsage: (input: { feature: PostpaidFeature; occurredAt: string; evidence: string; bytes: number | null }) => mutation.mutateAsync({
      name: "record_postpaid_feature_usage", args: { p_organization_id: organizationId, p_feature: input.feature, p_occurred_at: input.occurredAt, p_evidence: input.evidence, p_bytes: input.bytes },
      validate: data => confirmedOrgRow(data, organizationId) && (data as Record<string, unknown>).feature === input.feature,
    }) as Promise<PostpaidFeatureRecord>,
  };
}
