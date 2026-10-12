import { z } from "zod";

const id = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const nullableText = z.string().nullable();
const recordBase = { id, organization_id: id, created_at: timestamp };
const editableBase = { ...recordBase, updated_at: timestamp };

export const CRM_DEAL_STAGES = ["new", "contacted", "negotiation", "won", "lost"] as const;
export const CRM_TASK_STATUSES = ["pending", "done", "cancelled"] as const;
export const CRM_TASK_TYPES = ["call", "email", "meeting", "followup", "other"] as const;
export const CRM_ACTIVITY_TYPES = ["note", "call", "meeting", "email"] as const;

export const crmClientSchema = z.object({
  ...editableBase, org_name: z.string().min(1), inn: nullableText,
  email: nullableText, phone: nullableText, address: nullableText, notes: nullableText,
  company_id: id.nullable().optional(), student_user_id: id.nullable().optional(),
  linked_at: timestamp.nullable().optional(),
});
const dealSchema = z.object({
  ...editableBase, client_id: id, title: z.string().min(1),
  stage: z.enum(CRM_DEAL_STAGES), amount: z.number().finite().nonnegative(),
});
const taskSchema = z.object({
  ...editableBase, client_id: id, deal_id: id.nullable(), title: z.string().min(1),
  description: nullableText, type: z.enum(CRM_TASK_TYPES), status: z.enum(CRM_TASK_STATUSES),
  due_date: timestamp, assigned_user_id: id.nullable(), completed_at: timestamp.nullable(),
});
const activitySchema = z.object({
  ...recordBase, client_id: id, deal_id: id.nullable(),
  activity_type: z.enum(CRM_ACTIVITY_TYPES), description: z.string(), actor_user_id: id.nullable(),
});
const assigneeSchema = z.object({ user_id: id, full_name: z.string(), role: z.string(), email: nullableText.optional() });
const count = z.number().int().nonnegative().safe();
const snapshotSchema = z.object({
  clients: z.array(crmClientSchema), deals: z.array(dealSchema), tasks: z.array(taskSchema),
  activities: z.array(activitySchema), assignees: z.array(assigneeSchema),
  counts: z.object({ clients: count, deals: count, tasks: count, activities: count }),
  truncated: z.object({ clients: z.boolean(), deals: z.boolean(), tasks: z.boolean(), activities: z.boolean() }),
});

export type OrgCrmClient = z.infer<typeof crmClientSchema>;
export type OrgCrmDeal = z.infer<typeof dealSchema>;
export type OrgCrmTask = z.infer<typeof taskSchema>;
export type OrgCrmActivity = z.infer<typeof activitySchema>;
export type OrgCrmAssignee = z.infer<typeof assigneeSchema>;
export type OrgCrmSnapshot = z.infer<typeof snapshotSchema>;
export type OrgCrmDealStage = OrgCrmDeal["stage"];
export type OrgCrmTaskStatus = OrgCrmTask["status"];
export type OrgCrmTaskType = OrgCrmTask["type"];
export type OrgCrmActivityType = OrgCrmActivity["activity_type"];

interface EditableInput { id?: string; expected_updated_at?: string }
export interface OrgCrmClientInput extends EditableInput {
  org_name: string; inn?: string | null; email?: string | null;
  phone?: string | null; address?: string | null; notes?: string | null;
}
export interface OrgCrmDealInput extends EditableInput {
  client_id: string; title: string; stage: OrgCrmDealStage; amount: number;
}
export interface OrgCrmTaskInput extends EditableInput {
  client_id: string; deal_id?: string | null; title: string; description?: string | null;
  type: OrgCrmTaskType; status: OrgCrmTaskStatus; due_date: string; assigned_user_id?: string | null;
}
export interface OrgCrmActivityInput {
  client_id: string; deal_id?: string | null; activity_type: OrgCrmActivityType; description: string;
}
export interface OrgCrmSaveReceipt { id: string; updated_at?: string; created_at?: string }

export class OrgCrmError extends Error {
  constructor(message: string, public readonly code: string = "CRM_ERROR") {
    super(message);
    this.name = "OrgCrmError";
  }
}

export function crmError(error: unknown): OrgCrmError {
  if (error instanceof OrgCrmError) return error;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "40001") return new OrgCrmError("Запись уже изменена. Обновите данные и повторите изменение.", code);
  if (code === "42501") return new OrgCrmError("Нет доступа к CRM этой организации. Проверьте роль и тариф.", code);
  if (code === "23503") return new OrgCrmError("Связанный клиент, сделка или сотрудник недоступен. Обновите данные.", code);
  if (code === "23505") return new OrgCrmError("Карточка уже связана с CRM. Обновите данные перед повторной попыткой.", code);
  if (["22023", "22007", "22P02", "23514", "23502"].includes(code)) {
    return new OrgCrmError("Проверьте обязательные поля, сумму и срок задачи.", code);
  }
  return new OrgCrmError("Не удалось выполнить действие в CRM. Проверьте соединение и повторите попытку.", code || "CRM_ERROR");
}

export function parseOrgCrmSnapshot(value: unknown, organizationId: string): OrgCrmSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) throw new OrgCrmError("Сервер вернул неполные данные CRM. Повторите загрузку.", "CRM_INVALID_RESPONSE");
  const result = parsed.data;
  for (const kind of ["clients", "deals", "tasks", "activities"] as const) {
    const rows = result[kind];
    if (rows.some(row => row.organization_id !== organizationId)
      || new Set(rows.map(row => row.id)).size !== rows.length
      || result.counts[kind] < rows.length
      || result.truncated[kind] !== (result.counts[kind] > rows.length)) {
      throw new OrgCrmError("Полученные данные CRM не соответствуют выбранной организации. Повторите загрузку.", "CRM_INVALID_RESPONSE");
    }
  }
  return result;
}

const editing = { id: id.optional(), expected_updated_at: timestamp.optional() };
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const clientInputSchema = z.object({
  ...editing, org_name: z.string().trim().min(1).max(300), inn: optionalText(32),
  email: z.string().trim().email().max(320).nullable().optional(), phone: optionalText(100),
  address: optionalText(1000), notes: optionalText(10000),
});
const dealInputSchema = z.object({
  ...editing, client_id: id, title: z.string().trim().min(1).max(300),
  stage: z.enum(CRM_DEAL_STAGES), amount: z.number().finite().nonnegative(),
});
const taskInputSchema = z.object({
  ...editing, client_id: id, deal_id: id.nullable().optional(), title: z.string().trim().min(1).max(300),
  description: optionalText(10000), type: z.enum(CRM_TASK_TYPES), status: z.enum(CRM_TASK_STATUSES),
  due_date: timestamp, assigned_user_id: id.nullable().optional(),
});
const activityInputSchema = z.object({
  client_id: id, deal_id: id.nullable().optional(), activity_type: z.enum(CRM_ACTIVITY_TYPES),
  description: z.string().trim().min(1).max(10000),
});

export function crmSaveArguments(organizationId: string, kind: "client" | "deal" | "task", input: unknown) {
  const schema = kind === "client" ? clientInputSchema : kind === "deal" ? dealInputSchema : taskInputSchema;
  const parsed = schema.safeParse(input);
  if (!id.safeParse(organizationId).success || !parsed.success) {
    throw new OrgCrmError("Проверьте обязательные поля, email, сумму и срок задачи.", "CRM_INVALID_INPUT");
  }
  const { id: recordId, expected_updated_at: expected, ...values } = parsed.data;
  if (recordId && !expected) throw new OrgCrmError("Обновите запись перед редактированием.", "CRM_MISSING_REVISION");
  return { p_organization_id: organizationId, p_id: recordId ?? null, p_values: values, p_expected_updated_at: expected ?? null };
}

export function crmActivityArguments(organizationId: string, input: unknown) {
  const parsed = activityInputSchema.safeParse(input);
  if (!id.safeParse(organizationId).success || !parsed.success) {
    throw new OrgCrmError("Укажите клиента, вид события и текст записи.", "CRM_INVALID_INPUT");
  }
  return { p_organization_id: organizationId, p_client_id: parsed.data.client_id,
    p_deal_id: parsed.data.deal_id ?? null, p_activity_type: parsed.data.activity_type,
    p_description: parsed.data.description };
}

export function parseCrmSaveReceipt(value: unknown): OrgCrmSaveReceipt {
  const parsed = z.object({ id, updated_at: timestamp.optional(), created_at: timestamp.optional() }).safeParse(value);
  if (!parsed.success) throw new OrgCrmError("Не удалось подтвердить сохранение. Обновите CRM перед повторной попыткой.", "CRM_UNCONFIRMED_WRITE");
  return { ...parsed.data, id: id.parse(parsed.data.id) };
}
