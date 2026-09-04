import { supabase } from "@/integrations/supabase/client";
import { isValidIsoDate } from "@/lib/laborSafetyXml";
import type { LaborSafetyEnrollmentProtocol } from "@/types/laborSafetyProtocol";

import { pendingProtocolClient, type PendingProtocolReadClient, type PendingProtocolClient } from "./pendingLaborSafetyProtocolContract";
const defaultProtocolClient = pendingProtocolClient(supabase);
const TABLE = "labor_safety_enrollment_protocols";
const COLUMNS = "id, organization_id, enrollment_id, source_enrollment_id, source_user_id, source_course_id, learner_name_snapshot, course_title_snapshot, protocol_number, knowledge_check_date, is_passed, version, created_by, updated_by, created_at, updated_at";

export class LaborSafetyProtocolUnavailableError extends Error {
  constructor() {
    super("Сохранение протоколов пока недоступно: обновление базы ещё не установлено. Данные удостоверения для этого не нужны.");
    this.name = "LaborSafetyProtocolUnavailableError";
  }
}

export function isLaborSafetyProtocolStorageUnavailable(error: unknown): boolean {
  if (error instanceof LaborSafetyProtocolUnavailableError) return true;
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return ["PGRST205", "PGRST202", "42P01", "42883"].includes(code);
}

function throwProtocolError(error: unknown): never {
  if (isLaborSafetyProtocolStorageUnavailable(error)) throw new LaborSafetyProtocolUnavailableError();
  if (error instanceof Error) throw error;
  const message = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Не удалось прочитать или сохранить протокол";
  throw new Error(message);
}

function validateContext(organizationId: string, enrollmentId: string) {
  if (!organizationId || !enrollmentId) throw new Error("Не указан контекст организации или зачисления");
}

function requireProtocol(
  value: unknown,
  organizationId: string,
  enrollmentIds: ReadonlySet<string>,
): LaborSafetyEnrollmentProtocol {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("База вернула неподтверждённые данные протокола");
  const row = value as Record<string, unknown>;
  const requiredStrings = ["id", "organization_id", "enrollment_id", "source_enrollment_id", "source_user_id", "source_course_id", "course_title_snapshot", "protocol_number", "knowledge_check_date", "created_by", "updated_by", "created_at", "updated_at"] as const;
  if (requiredStrings.some(key => typeof row[key] !== "string" || !(row[key] as string).trim())
    || !(row.learner_name_snapshot === null || typeof row.learner_name_snapshot === "string")
    || !row.id
    || row.organization_id !== organizationId
    || typeof row.enrollment_id !== "string" || !enrollmentIds.has(row.enrollment_id)
    || row.source_enrollment_id !== row.enrollment_id
    || typeof row.knowledge_check_date !== "string" || !isValidIsoDate(row.knowledge_check_date)
    || !Number.isFinite(Date.parse(String(row.created_at))) || !Number.isFinite(Date.parse(String(row.updated_at)))
    || typeof row.is_passed !== "boolean"
    || typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 1
  ) throw new Error("База вернула неподтверждённые данные протокола");
  return row as unknown as LaborSafetyEnrollmentProtocol;
}

export async function fetchStudentLaborSafetyProtocols(
  input: { organizationId: string; enrollmentIds: string[] },
  client: PendingProtocolReadClient = defaultProtocolClient,
): Promise<LaborSafetyEnrollmentProtocol[]> {
  if (!input.organizationId) throw new Error("Не указана организация");
  const enrollmentIds = new Set(input.enrollmentIds);
  if (enrollmentIds.size === 0) return [];
  const { data, error } = await client.from(TABLE).select(COLUMNS)
    .eq("organization_id", input.organizationId)
    .in("enrollment_id", [...enrollmentIds]);
  if (error) throwProtocolError(error);
  const seen = new Set<string>();
  if (!Array.isArray(data)) throw new Error("База вернула неподтверждённый список протоколов");
  return data.map(row => {
    const protocol = requireProtocol(row, input.organizationId, enrollmentIds);
    if (seen.has(protocol.source_enrollment_id)) throw new Error("Для зачисления найдено несколько протоколов");
    seen.add(protocol.source_enrollment_id);
    return protocol;
  });
}

export async function fetchStudentLaborSafetyProtocol(
  input: { organizationId: string; enrollmentId: string },
  client: PendingProtocolReadClient = defaultProtocolClient,
): Promise<LaborSafetyEnrollmentProtocol | null> {
  validateContext(input.organizationId, input.enrollmentId);
  const { data, error } = await client.from(TABLE).select(COLUMNS)
    .eq("organization_id", input.organizationId)
    .eq("enrollment_id", input.enrollmentId)
    .maybeSingle();
  if (error) throwProtocolError(error);
  return data === null ? null : requireProtocol(data, input.organizationId, new Set([input.enrollmentId]));
}

export async function saveStudentLaborSafetyProtocol(
  input: {
    organizationId: string;
    enrollmentId: string;
    protocolNumber: string;
    knowledgeCheckDate: string;
    isPassed: boolean;
    expectedVersion: number | null;
  },
  client: PendingProtocolClient = defaultProtocolClient,
): Promise<LaborSafetyEnrollmentProtocol> {
  validateContext(input.organizationId, input.enrollmentId);
  const protocolNumber = input.protocolNumber.trim();
  if (!protocolNumber || protocolNumber.length > 200) throw new Error("Укажите номер протокола: от 1 до 200 символов");
  if (!isValidIsoDate(input.knowledgeCheckDate)) throw new Error("Укажите корректную дату проверки знаний");
  if (typeof input.isPassed !== "boolean") throw new Error("Выберите результат проверки знаний");
  if (input.expectedVersion !== null && (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)) {
    throw new Error("Обновите данные протокола перед сохранением");
  }

  const { data, error } = await client.rpc("save_labor_safety_enrollment_protocol", {
    p_organization_id: input.organizationId,
    p_enrollment_id: input.enrollmentId,
    p_protocol_number: protocolNumber,
    p_knowledge_check_date: input.knowledgeCheckDate,
    p_is_passed: input.isPassed,
    p_expected_version: input.expectedVersion,
  });
  if (error) throwProtocolError(error);
  if (!Array.isArray(data) || data.length !== 1) throw new Error("База не подтвердила сохранение протокола. Обновите данные перед повтором");
  const saved = requireProtocol(data[0], input.organizationId, new Set([input.enrollmentId]));
  const expectedVersion = (input.expectedVersion ?? 0) + 1;
  if (saved.version !== expectedVersion || saved.protocol_number !== protocolNumber
    || saved.knowledge_check_date !== input.knowledgeCheckDate || saved.is_passed !== input.isPassed) {
    throw new Error("Ответ базы не совпал с сохранённым протоколом. Обновите данные перед повтором");
  }

  // A successful RPC alone is not enough: confirm the exact persisted row.
  const confirmed = await fetchStudentLaborSafetyProtocol(input, client);
  if (!confirmed || confirmed.id !== saved.id || confirmed.version !== saved.version
    || confirmed.source_user_id !== saved.source_user_id
    || confirmed.source_course_id !== saved.source_course_id
    || confirmed.protocol_number !== saved.protocol_number
    || confirmed.knowledge_check_date !== saved.knowledge_check_date
    || confirmed.is_passed !== saved.is_passed) {
    throw new Error("Повторное чтение не подтвердило сохранение протокола. Обновите данные перед повтором");
  }
  return confirmed;
}
