import type { SubscriptionPlan } from "@/constants/subscriptionPlans";
import type { PlatformContractPeriodMonths } from "@/lib/platform-contract";

/** Семейство коммерческих документов по подписке на платформу. */
export const PLATFORM_DOCUMENT_FAMILY = "platform_subscription";

/** Версия шаблона проекта договора (единый генератор platform-contract). */
export const PLATFORM_CONTRACT_TEMPLATE_VERSION = 2;

/** Название проекта договора — одинаково для клиента и админа. */
export const PLATFORM_CONTRACT_PROJECT_NAME = "Проект договора на платформу СИНТАГМА";

export interface PlatformCustomerRequisites {
  name?: string | null;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  legal_address?: string | null;
  actual_address?: string | null;
  director_name?: string | null;
  director_position?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface PlatformContractRow {
  id: string;
  organization_id: string;
  name: string;
  contract_number: string | null;
  contract_date: string | null;
  status: string;
  counterparty_type: string | null;
  variables: any;
  variables_snapshot: any;
  body_html: string | null;
  template_version: number | null;
  created_at?: string;
}

export interface PlatformInvoiceRow {
  id: string;
  organization_id: string;
  invoice_number: string;
  invoice_date: string;
  plan: string;
  amount: number;
  period_months: number;
  status: string;
  paid_at: string | null;
  buyer_name?: string | null;
  buyer_inn?: string | null;
  buyer_kpp?: string | null;
}

export interface PlatformBillingDocRow {
  id: string;
  organization_id: string;
  name: string;
  doc_type: string;
  file_url: string;
  created_at: string;
}

export interface PlatformCommercialSet {
  contract: PlatformContractRow | null;
  invoice: PlatformInvoiceRow | null;
  paidInvoice: PlatformInvoiceRow | null;
  act: PlatformBillingDocRow | null;
}

export interface PlatformSetRequest {
  organizationId: string;
  plan: SubscriptionPlan;
  periodMonths: PlatformContractPeriodMonths;
  customer: PlatformCustomerRequisites;
}
