import { AccessError, checked, requireUuid, type AccessDb, type Actor } from "./privileged-access.ts";

// Use the request's verified user client: the RPC resolves auth.uid() on the
// server, never an actor or organization supplied in the request body.
export async function requireDocumentWrite(userDb: AccessDb, organizationId: string, groupId: string | null = null): Promise<void> {
  const allowed = checked(await userDb.rpc("uc_document_action_allowed", {
    p_org: organizationId, p_action: "write", p_group: groupId, p_enrollment: null,
  }));
  if (allowed !== true) throw new AccessError(403, "Нет права изменять документы этой организации");
}

export function billingDocumentTarget(body: Record<string, unknown>): {
  organizationId: string; groupId: string | null; html: string; fileName: string; storagePath: string;
} {
  if (typeof body.html !== "string" || !body.html.trim() || body.html.length > 5_000_000) {
    throw new AccessError(400, "Некорректный или слишком большой документ");
  }
  if (typeof body.fileName !== "string" || !body.fileName.trim() || body.fileName.length > 1000 ||
      /[\u0000-\u001f\u007f/\\]/.test(body.fileName)) {
    throw new AccessError(400, "Некорректное имя файла");
  }
  if (typeof body.storagePath !== "string" || body.storagePath.length > 2000 ||
      /[%\\?#\u0000-\u001f\u007f]/.test(body.storagePath)) {
    throw new AccessError(400, "Некорректный путь документа");
  }
  const segments = body.storagePath.split("/");
  const organizationId = requireUuid(segments[0], "организация");
  if (segments.length < 4 || !["bulk", "contracts"].includes(segments[1]) ||
      segments.some(segment => !segment || segment === "." || segment === "..") ||
      !segments.at(-1)!.toLowerCase().endsWith(".pdf")) {
    throw new AccessError(400, "Некорректный путь документа");
  }
  const groupId = segments[1] === "contracts" ? requireUuid(segments[2], "учебная группа") : null;
  return { organizationId, groupId, html: body.html, fileName: body.fileName, storagePath: body.storagePath };
}

// Organizations request the service; only the platform administrator can
// execute its fulfilment job. Check order ownership before reading any facts.
export async function requireSelfExaminationOrder(
  db: AccessDb, actor: Actor, organizationId: string, orderId: string | null,
): Promise<Record<string, any> | null> {
  if (!actor.userId || actor.service) throw new AccessError(403, "Требуется сессия администратора");
  const role = checked<any>(await db.from("user_roles").select("role")
    .eq("user_id", actor.userId).eq("role", "admin").maybeSingle());
  if (role?.role !== "admin") throw new AccessError(403, "Требуются права администратора платформы");
  const platformWrite = checked(await db.rpc("uc_platform_document_action_allowed", {
    p_user: actor.userId, p_action: "write",
  }));
  if (platformWrite !== true) throw new AccessError(403, "Нет права исполнять услуги по документам платформы");
  if (!orderId) return null; // Preserve the administrator's explicit manual workflow.
  const order = checked<any>(await db.from("service_orders").select("id,organization_id,service_id,status,notes")
    .eq("id", orderId).maybeSingle());
  if (!order || order.organization_id !== organizationId ||
      !["self_examination_report", "self_examination_report_auto"].includes(order.service_id)) {
    throw new AccessError(403, "Заказ не относится к формированию отчёта этой организации");
  }
  if (["cancelled", "canceled", "refunded", "rejected"].includes(order.status)) {
    throw new AccessError(409, "Этот заказ нельзя исполнить");
  }
  return order;
}

export async function completeSelfExaminationOrder(db: AccessDb, order: Record<string, any> | null): Promise<void> {
  if (!order || order.status === "completed") return;
  const result = await db.from("service_orders").update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", order.id).eq("organization_id", order.organization_id).eq("service_id", order.service_id)
    .eq("status", order.status).select("id").maybeSingle();
  if (result.error) throw new AccessError(503, "Отчёт сохранён, но исполнение заказа пока не подтверждено. Повторите запрос");
  if (!result.data) throw new AccessError(409, "Статус заказа изменился во время подготовки отчёта. Сохранённая версия доступна в документах");
}
