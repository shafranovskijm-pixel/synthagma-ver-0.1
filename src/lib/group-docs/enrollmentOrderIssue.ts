import { z } from "zod";
import { safeInvoke } from "@/utils/safeInvoke";
import { proxiedAssetUrl } from "@/utils/proxyFetch";

export const ENROLLMENT_ORDER_REVISION = "goreltech-enrollment-order-v1";
const uuid = z.string().uuid();
const hash = z.string().regex(/^[A-F0-9]{64}$/);
const scopeSchema = z.object({ organizationId: uuid, groupId: uuid, actorId: uuid });
export type OrderScope = z.infer<typeof scopeSchema>;
const snapshotSchema = z.object({
  organization: z.object({ id: uuid, name: z.string() }).passthrough(),
  group: z.object({ id: uuid, organization_id: uuid, course_id: uuid.nullable(),
    group_number: z.string().nullable(), program_title: z.string().nullable(),
    program_hours: z.number().nullable(), start_date: z.string().nullable(), end_date: z.string().nullable() }).passthrough(),
  profiles: z.array(z.object({ user_id: uuid, full_name: z.string().nullable() }).passthrough()),
}).passthrough();
const operationSchema = z.object({
  operationId: uuid, organizationId: uuid, groupId: uuid, actorId: uuid,
  status: z.enum(["reserved", "completed"]), snapshot: snapshotSchema, snapshotHash: hash,
  documentNumber: z.string().min(1), documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  signatory: z.object({ position: z.string().min(1), name: z.string().min(1) }),
  templateSha256: hash, filePath: z.string().nullable(), docxSha256: hash.nullable(),
}).passthrough();
export type EnrollmentOrderOperation = z.infer<typeof operationSchema>;
const previewSchema = z.object({
  snapshot: snapshotSchema, snapshotHash: hash, canFinalize: z.boolean(),
  issues: z.array(z.object({ message: z.string() }).passthrough()),
  documentSummary: z.object({ groupNumber: z.string(), programTitle: z.string(), programHours: z.string(), startDate: z.string(), endDate: z.string() }),
});
export type EnrollmentOrderPreview = z.infer<typeof previewSchema>;
export interface EnrollmentOrderConfirmation {
  documentDate: string; signatory: { position: string; name: string }; expectedSnapshotHash: string;
}

async function request(scope: OrderScope, action: string, extra: Record<string, unknown> = {}) {
  scopeSchema.parse(scope);
  const { data, error } = await safeInvoke<unknown>("issue-group-enrollment-order", {
    // No implicit retries, including the first request that reserves a number.
    retry: false, body: { action, organizationId: scope.organizationId, groupId: scope.groupId, ...extra },
  });
  if (error) throw error;
  const payload = z.object({ revision: z.literal(ENROLLMENT_ORDER_REVISION), organizationId: uuid, groupId: uuid }).passthrough().parse(data);
  if (payload.organizationId !== scope.organizationId || payload.groupId !== scope.groupId) throw new Error("Ответ относится к другой группе.");
  return payload;
}

function parseOperation(value: unknown, scope: OrderScope, operationId?: string, ownActor = true) {
  const operation = operationSchema.parse(value);
  if (operation.organizationId !== scope.organizationId || operation.groupId !== scope.groupId
    || (ownActor && operation.actorId !== scope.actorId) || (operationId && operation.operationId !== operationId)
    || operation.snapshot.organization.id !== scope.organizationId || operation.snapshot.group.id !== scope.groupId
    || operation.snapshot.group.organization_id !== scope.organizationId) throw new Error("Принадлежность приказа не подтверждена.");
  if (operation.status === "completed" && (!operation.filePath || !operation.docxSha256)) throw new Error("Файл оформленного приказа не подтверждён.");
  if (operation.status === "reserved" && (operation.filePath !== null || operation.docxSha256 !== null)) throw new Error("Незавершённый приказ содержит неподтверждённый файл.");
  if (operation.filePath && operation.filePath !== `${scope.organizationId}/enrollment-orders/${scope.groupId}/${operation.operationId}/${operation.docxSha256}.docx`) throw new Error("Путь приказа не подтверждён.");
  return operation;
}

export async function previewEnrollmentOrder(scope: OrderScope) {
  const preview = previewSchema.parse(await request(scope, "preview"));
  if (preview.snapshot.organization.id !== scope.organizationId || preview.snapshot.group.id !== scope.groupId
    || preview.snapshot.group.organization_id !== scope.organizationId) throw new Error("Состав относится к другой группе.");
  return preview;
}
export async function listEnrollmentOrders(scope: OrderScope) {
  const payload = await request(scope, "list");
  return z.array(z.unknown()).parse(payload.operations).map(item => {
    const operation = parseOperation(item, scope, undefined, false);
    if (operation.status !== "completed") throw new Error("В списке оформленных приказов есть незавершённая операция.");
    return operation;
  });
}
export async function readEnrollmentOrder(scope: OrderScope, operationId: string) {
  uuid.parse(operationId);
  const payload = await request(scope, "status", { operationId });
  // NULL is unknown; it never authorizes starting a different operation.
  return payload.operation === null ? null : parseOperation(payload.operation, scope, operationId);
}
export async function finalizeEnrollmentOrder(scope: OrderScope, operationId: string, confirmation: EnrollmentOrderConfirmation) {
  uuid.parse(operationId);
  const payload = await request(scope, "finalize", { operationId, ...confirmation, confirmed: true });
  return parseOperation(payload.operation, scope, operationId);
}
export async function resumeEnrollmentOrder(scope: OrderScope, operationId: string) {
  uuid.parse(operationId);
  const payload = await request(scope, "resume", { operationId, confirmed: true });
  return parseOperation(payload.operation, scope, operationId);
}
export async function downloadEnrollmentOrder(scope: OrderScope, operationId: string) {
  const payload = await request(scope, "download", { operationId: uuid.parse(operationId) });
  if (payload.operationId !== operationId) throw new Error("Ссылка относится к другому приказу.");
  const url = new URL(z.string().url().parse(payload.url));
  const backend = new URL(import.meta.env.VITE_SUPABASE_URL || "https://atxwvjxbqjgkbjlhsdch.supabase.co");
  const prefix = `/storage/v1/object/sign/goreltech-issued-documents/${scope.organizationId}/enrollment-orders/${scope.groupId}/${operationId}/`;
  if (url.protocol !== "https:" || url.username || url.password || url.origin !== backend.origin
    || !url.pathname.startsWith(prefix) || !/^[A-F0-9]{64}\.docx$/.test(url.pathname.slice(prefix.length))) throw new Error("Ссылка на файл не подтверждена.");
  const link = document.createElement("a");
  link.href = proxiedAssetUrl(url.href); link.download = "Приказ о зачислении.docx"; link.rel = "noopener";
  document.body.appendChild(link); link.click(); link.remove();
}

export function enrollmentOrderStorageKey(scope: OrderScope) {
  scopeSchema.parse(scope);
  return `sintagma:enrollment-order:${scope.actorId}:${scope.organizationId}:${scope.groupId}`;
}
export function readPendingEnrollmentOrder(scope: OrderScope): string | null {
  const key = enrollmentOrderStorageKey(scope);
  const value = localStorage.getItem(key);
  if (!value) return null;
  uuid.parse(value);
  return localStorage.getItem(`${key}:ack:${value}`) === value ? null : value;
}
export function beginEnrollmentOrder(scope: OrderScope): string {
  if (readPendingEnrollmentOrder(scope)) throw new Error("Сначала проверьте предыдущую операцию оформления.");
  const operationId = crypto.randomUUID();
  const key = enrollmentOrderStorageKey(scope);
  localStorage.setItem(key, operationId);
  if (localStorage.getItem(key) !== operationId) throw new Error("Не удалось сохранить идентификатор операции. Оформление не отправлено.");
  return operationId;
}
export function acknowledgeEnrollmentOrder(scope: OrderScope, operationId: string) {
  uuid.parse(operationId);
  const key = enrollmentOrderStorageKey(scope);
  // Exact-ID ACK avoids deleting an index that another browser tab just changed.
  localStorage.setItem(`${key}:ack:${operationId}`, operationId);
  if (localStorage.getItem(`${key}:ack:${operationId}`) !== operationId) throw new Error("Не удалось сохранить подтверждение операции.");
}
