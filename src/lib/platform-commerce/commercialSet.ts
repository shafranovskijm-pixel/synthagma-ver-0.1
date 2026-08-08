import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { localDateIso } from "@/lib/date/localDate";
import {
  buildPlatformContractDocumentHtml,
  derivePlatformContractDraft,
  type PlatformContractCustomer,
  type PlatformContractDraft,
  type PlatformContractPeriodMonths,
} from "@/lib/platform-contract";
import {
  PLATFORM_CONTRACT_PROJECT_NAME,
  PLATFORM_CONTRACT_TEMPLATE_VERSION,
  PLATFORM_DOCUMENT_FAMILY,
  type PlatformBillingDocRow,
  type PlatformCommercialSet,
  type PlatformContractRow,
  type PlatformCustomerRequisites,
  type PlatformInvoiceRow,
  type PlatformSetRequest,
} from "./types";

/* ─────────────── реквизиты заказчика ─────────────── */

/** Обязательные реквизиты для проекта договора юрлица. */
export const REQUIRED_REQUISITES: { key: keyof PlatformCustomerRequisites; label: string }[] = [
  { key: "name", label: "Полное наименование организации" },
  { key: "inn", label: "ИНН" },
  { key: "legal_address", label: "Юридический адрес" },
  { key: "director_name", label: "ФИО руководителя" },
  { key: "director_position", label: "Должность руководителя" },
];

/** Возвращает только реально отсутствующие обязательные реквизиты. */
export function missingRequisites(
  org: PlatformCustomerRequisites | null | undefined,
): { key: string; label: string }[] {
  return REQUIRED_REQUISITES.filter(({ key }) => {
    const v = org?.[key];
    return !(typeof v === "string" && v.trim().length > 0);
  }).map(({ key, label }) => ({ key: String(key), label }));
}

/** Автозаполнение заказчика из записи organizations. */
export function customerFromOrganization(
  org: PlatformCustomerRequisites | null | undefined,
): PlatformContractCustomer {
  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    name: t(org?.name),
    inn: t(org?.inn),
    kpp: t(org?.kpp),
    ogrn: t(org?.ogrn),
    address: t(org?.legal_address) ?? t(org?.actual_address),
    signatoryName: t(org?.director_name),
    signatoryPosition: t(org?.director_position),
    email: t(org?.email),
    phone: t(org?.phone),
  };
}

/* ─────────────── номер счёта ─────────────── */

const PLAN_CODE: Record<SubscriptionPlan, string> = {
  free: "FREE",
  start: "STA",
  standard: "STD",
  professional: "PRO",
  maximum: "MAX",
};

function stableHash6(input: string): string {
  // FNV-1a → base36, детерминированно и без обращения к БД
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

/**
 * Читаемый уникальный номер счёта. НЕ используется count+1: номер детерминирован
 * от организации/тарифа/срока/даты, поэтому повторное нажатие даёт тот же номер,
 * а коллизии между организациями исключены хэшем UUID организации.
 */
export function platformInvoiceNumber(input: {
  organizationId: string;
  plan: SubscriptionPlan;
  periodMonths: PlatformContractPeriodMonths;
  date?: string;
}): string {
  const date = input.date || localDateIso();
  const [y, m, d] = date.split("-");
  const hash = stableHash6(`${input.organizationId}|${input.plan}|${input.periodMonths}|${date}`);
  return `СЧ-${y}/${m}${d}-${PLAN_CODE[input.plan]}${input.periodMonths}-${hash}`;
}

/* ─────────────── статусы ─────────────── */

export function isInvoicePaid(invoice: PlatformInvoiceRow | null | undefined): boolean {
  if (!invoice) return false;
  return invoice.status === "paid" && !!invoice.paid_at;
}

/** Акт доступен только по реально оплаченному счёту. */
export function canIssueAct(set: Pick<PlatformCommercialSet, "paidInvoice">): boolean {
  return isInvoicePaid(set.paidInvoice);
}

export const ACT_LOCKED_REASON = "Станет доступен после подтверждённой оплаты";

/** Проекту договора официальный номер не присваивается. */
export function contractNumberForStatus(status: "draft" | "approved", officialNumber?: string | null): string | null {
  if (status !== "approved") return null;
  const v = (officialNumber || "").trim();
  return v ? v : null;
}

/* ─────────────── проект договора ─────────────── */

export function buildDraftForRequest(
  req: PlatformSetRequest,
  date?: string,
  projectId?: string,
): PlatformContractDraft {
  return derivePlatformContractDraft({
    plan: req.plan,
    periodMonths: req.periodMonths,
    customer: customerFromOrganization(req.customer),
    date,
    projectId,
  });
}

export function buildContractVariables(draft: PlatformContractDraft) {
  return {
    document_family: PLATFORM_DOCUMENT_FAMILY,
    status: "project",
    plan: draft.plan,
    planName: draft.planName,
    periodMonths: draft.periodMonths,
    monthlyPrice: draft.monthlyPrice,
    effectiveMonthlyPrice: draft.effectiveMonthlyPrice,
    discountRate: draft.discountRate,
    discountAmount: draft.discountAmount,
    totalAmount: draft.totalAmount,
    templateVersion: PLATFORM_CONTRACT_TEMPLATE_VERSION,
    requisites: draft.customer,
    date: draft.date,
  };
}

function isPlatformContractRow(row: any): boolean {
  const fam = row?.variables?.document_family ?? row?.variables_snapshot?.document_family;
  return fam === PLATFORM_DOCUMENT_FAMILY;
}

/**
 * Идемпотентно сохраняет ОДИН проект договора для организации.
 * Повторный вызов с тем же тарифом/сроком/датой обновляет существующий черновик.
 */
export async function ensurePlatformContractProject(
  client: any,
  req: PlatformSetRequest,
  draft: PlatformContractDraft,
): Promise<PlatformContractRow> {
  const { data: existingRows } = await client
    .from("org_contracts")
    .select("*")
    .eq("organization_id", req.organizationId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(20);

  const variables = buildContractVariables(draft);
  const body_html = buildPlatformContractDocumentHtml(draft);

  const existing = ((existingRows as any[]) || []).filter(isPlatformContractRow).find((r) => {
    const v = r.variables || {};
    return v.plan === draft.plan && Number(v.periodMonths) === draft.periodMonths;
  });

  if (existing) {
    const { data, error } = await client
      .from("org_contracts")
      .update({
        name: PLATFORM_CONTRACT_PROJECT_NAME,
        contract_number: null,
        contract_date: draft.date,
        counterparty_type: "legal",
        variables,
        variables_snapshot: variables,
        body_html,
        template_version: PLATFORM_CONTRACT_TEMPLATE_VERSION,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as PlatformContractRow;
  }

  const { data, error } = await client
    .from("org_contracts")
    .insert({
      organization_id: req.organizationId,
      name: PLATFORM_CONTRACT_PROJECT_NAME,
      contract_number: null,
      contract_date: draft.date,
      status: "draft",
      counterparty_type: "legal",
      variables,
      variables_snapshot: variables,
      body_html,
      template_version: PLATFORM_CONTRACT_TEMPLATE_VERSION,
      template_format: "html",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PlatformContractRow;
}

/* ─────────────── счёт ─────────────── */

/**
 * Идемпотентно создаёт счёт именно на выбранный тариф/срок/сумму.
 * Дубли исключены поиском по детерминированному номеру.
 */
export async function ensurePlatformInvoice(
  client: any,
  req: PlatformSetRequest,
  draft: PlatformContractDraft,
): Promise<PlatformInvoiceRow> {
  const invoice_number = platformInvoiceNumber({
    organizationId: req.organizationId,
    plan: req.plan,
    periodMonths: req.periodMonths,
    date: draft.date,
  });

  const { data: found } = await client
    .from("subscription_invoices")
    .select("*")
    .eq("organization_id", req.organizationId)
    .eq("invoice_number", invoice_number)
    .limit(1);

  if ((found as any[])?.[0]) return (found as any[])[0] as PlatformInvoiceRow;

  const { data, error } = await client
    .from("subscription_invoices")
    .insert({
      organization_id: req.organizationId,
      invoice_number,
      invoice_date: draft.date,
      plan: draft.plan,
      amount: draft.totalAmount,
      period_months: draft.periodMonths,
      buyer_name: draft.customer.name || null,
      buyer_inn: draft.customer.inn || null,
      buyer_kpp: draft.customer.kpp || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PlatformInvoiceRow;
}

/* ─────────────── комплект ─────────────── */

export async function createPlatformCommercialSet(
  client: any,
  req: PlatformSetRequest,
): Promise<{ contract: PlatformContractRow; invoice: PlatformInvoiceRow; draft: PlatformContractDraft }> {
  if (SUBSCRIPTION_PLANS[req.plan].price <= 0) {
    throw new Error("Комплект документов формируется только для платного тарифа");
  }
  const draft = buildDraftForRequest(req);
  const contract = await ensurePlatformContractProject(client, req, draft);
  const invoice = await ensurePlatformInvoice(client, req, draft);
  return { contract, invoice, draft };
}

/** Одни и те же записи для клиента и админа, строго по organizationId. */
export async function fetchPlatformCommercialSet(
  client: any,
  organizationId: string,
): Promise<PlatformCommercialSet> {
  const [contractsRes, invoicesRes, docsRes] = await Promise.all([
    client
      .from("org_contracts")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("subscription_invoices")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("org_billing_documents")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("doc_type", "act")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const contracts = ((contractsRes?.data as any[]) || []).filter(isPlatformContractRow);
  const invoices = ((invoicesRes?.data as any[]) || []) as PlatformInvoiceRow[];
  const acts = ((docsRes?.data as any[]) || []).filter(
    (d) => !(d as any).deleted_at,
  ) as PlatformBillingDocRow[];

  return {
    contract: (contracts[0] as PlatformContractRow) || null,
    invoice: invoices[0] || null,
    paidInvoice: invoices.find((i) => isInvoicePaid(i)) || null,
    act: acts[0] || null,
  };
}
