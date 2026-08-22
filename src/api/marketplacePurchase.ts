import { supabase } from "@/integrations/supabase/client";

export type MarketplacePurchaseErrorCode =
  | "invalid_input"
  | "plan_limit"
  | "insufficient_balance"
  | "permission_denied"
  | "unavailable"
  | "unknown";

export class MarketplacePurchaseError extends Error {
  readonly code: MarketplacePurchaseErrorCode;

  constructor(code: MarketplacePurchaseErrorCode, message: string) {
    super(message);
    this.name = "MarketplacePurchaseError";
    this.code = code;
  }
}

interface PurchaseMarketplaceCourseInput {
  marketplaceCourseId: string;
  organizationId: string;
  studentsCount: number;
  notes?: string | null;
}

export interface MarketplacePurchaseResult {
  orderId: string;
  courseId: string;
  price: number;
}

function toMarketplacePurchaseError(error: unknown): MarketplacePurchaseError {
  const record = error && typeof error === "object"
    ? error as Record<string, unknown>
    : {};
  const code = String(record.code ?? "");
  const message = String(record.message ?? "").toLowerCase();

  if (code === "P0001" || message.includes("maximum course limit")) {
    return new MarketplacePurchaseError(
      "plan_limit",
      "Достигнут лимит курсов тарифа. Удалите ненужный курс или смените тариф",
    );
  }
  if (code === "P0003" || message.includes("insufficient organization balance")) {
    return new MarketplacePurchaseError(
      "insufficient_balance",
      "Недостаточно средств на балансе организации",
    );
  }
  if (code === "42501") {
    return new MarketplacePurchaseError(
      "permission_denied",
      "Недостаточно прав для добавления курса в организацию",
    );
  }
  if (code === "P0002") {
    return new MarketplacePurchaseError(
      "unavailable",
      "Курс больше недоступен в магазине. Обновите каталог",
    );
  }
  if (code === "22023") {
    return new MarketplacePurchaseError(
      "invalid_input",
      "Проверьте параметры заказа и повторите попытку",
    );
  }
  return new MarketplacePurchaseError(
    "unknown",
    "Не удалось добавить курс. Повторите попытку",
  );
}

/**
 * Creates the paid order, debits the organization balance and delivers the
 * cloned course in one database transaction. The server owns price, tenant
 * authorization and quota decisions.
 */
export async function purchaseMarketplaceCourse({
  marketplaceCourseId,
  organizationId,
  studentsCount,
  notes,
}: PurchaseMarketplaceCourseInput): Promise<MarketplacePurchaseResult> {
  const normalizedMarketplaceCourseId = marketplaceCourseId.trim();
  const normalizedOrganizationId = organizationId.trim();

  if (
    !normalizedMarketplaceCourseId
    || !normalizedOrganizationId
    || !Number.isInteger(studentsCount)
    || studentsCount < 1
  ) {
    throw new MarketplacePurchaseError(
      "invalid_input",
      "Проверьте параметры заказа и повторите попытку",
    );
  }

  const { data, error } = await supabase.rpc("purchase_marketplace_course", {
    p_marketplace_course_id: normalizedMarketplaceCourseId,
    p_target_organization_id: normalizedOrganizationId,
    p_buyer_type: "organization",
    p_students_count: studentsCount,
    p_notes: notes?.trim() || null,
  });

  if (error) throw toMarketplacePurchaseError(error);

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw toMarketplacePurchaseError(null);
  }

  const result = data as Record<string, unknown>;
  const orderId = typeof result.order_id === "string" ? result.order_id : "";
  const courseId = typeof result.course_id === "string" ? result.course_id : "";
  const price = Number(result.price);

  if (!orderId || !courseId || !Number.isFinite(price)) {
    throw toMarketplacePurchaseError(null);
  }

  return { orderId, courseId, price };
}
