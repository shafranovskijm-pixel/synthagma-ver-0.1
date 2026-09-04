import { buildGroupDocumentFactRows, type GroupDocumentFactsSnapshot } from "./groupDocumentFacts.ts";
import { buildCanonicalDocumentMetadataScalars, compileGroupDocumentXml, resolveDocumentSignatory, validateGroupDocumentPrerequisites, type GroupDocumentManifest } from "./groupDocument.ts";

export const ENROLLMENT_ORDER_REVISION = "goreltech-enrollment-order-v1";
export const ENROLLMENT_ORDER_TEMPLATE_SHA256 = "1A5E190569CE7CB152B39C644B3C7200DB88053F5BC9FD4E1F8D9FDE08BAB54C";
export const ENROLLMENT_ORDER_BUCKET = "goreltech-issued-documents";
export const GORELTECH_ORGANIZATION_ID = "7237f9d4-3670-4a19-8946-a43c68fd3473";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
export type EnrollmentOrderAction = "preview" | "finalize" | "resume" | "status" | "list" | "download";
export interface EnrollmentOrderScope { actorId: string; organizationId: string; groupId: string }
export interface EnrollmentOrderSnapshot extends Omit<GroupDocumentFactsSnapshot, "enrollments"> {
  organization: { id: string; name: string; inn: string; kpp: string | null; ogrn: string | null; legal_address: string | null };
  metadata: { clientResponsiblePersonName: string; clientOrganizationShortName: string; responsiblePersonSource: string; documentStage: "enrollment_prepared_unsigned" };
  enrollments: readonly (Omit<GroupDocumentFactsSnapshot["enrollments"][number], "progress"> & { progress: number | null })[];
}
export interface EnrollmentOrderRecord extends EnrollmentOrderScope {
  operationId: string;
  status: "reserved" | "completed";
  snapshot: EnrollmentOrderSnapshot;
  snapshotCanonical: string;
  snapshotHash: string;
  documentNumber: string;
  documentDate: string;
  signatory: { position: string; name: string };
  templateSha256: string;
  filePath: string | null;
  docxSha256: string | null;
}
export interface EnrollmentOrderIssue { code: string; field: string; message: string }
export class EnrollmentOrderError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
function fail(code: string, message: string, status = 409): never { throw new EnrollmentOrderError(code, message, status); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_response", "Структура ответа сервера не подтверждена.");
  return value as Record<string, unknown>;
}
function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) fail("invalid_id", `Некорректный идентификатор: ${field}.`, 400);
  return value.toLowerCase();
}
function hash(value: unknown): string {
  if (typeof value !== "string" || !SHA.test(value)) fail("invalid_hash", "Контрольная сумма ответа не подтверждена.");
  return value.toUpperCase();
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Reject, never remove, forbidden XML 1.0 codepoints, including lone UTF-16 surrogates. */
function xmlSafe(value: string): boolean {
  return [...value].every((char) => {
    const n = char.codePointAt(0)!;
    return n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff);
  });
}
function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || !xmlSafe(value)) {
    fail("invalid_text", `Проверьте поле «${field}»: оно обязательно и должно содержать допустимый текст.`, 400);
  }
  return value.trim();
}
function signatory(value: unknown) {
  const input = object(value);
  return { position: requiredText(input.position, "Должность подписанта", 200), name: requiredText(input.name, "ФИО подписанта", 300) };
}
function nullableText(value: unknown): boolean { return value === null || typeof value === "string"; }
function nullableNumber(value: unknown): boolean { return value === null || typeof value === "number" && Number.isFinite(value); }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function enrollmentOrderSha256(bytes: Uint8Array | string): Promise<string> {
  const input = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const result = await crypto.subtle.digest("SHA-256", new Uint8Array(input));
  return Array.from(new Uint8Array(result), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function readSnapshot(value: unknown, scope: EnrollmentOrderScope): EnrollmentOrderSnapshot {
  const input = object(value), org = object(input.organization), group = object(input.group);
  if (org.id !== scope.organizationId || group.id !== scope.groupId || group.organization_id !== scope.organizationId
    || org.inn !== "7806541216" || typeof org.name !== "string" || !/ГОРЭЛТЕХ/i.test(org.name)) {
    fail("snapshot_scope_mismatch", "Снимок не относится к выбранной организации и группе.");
  }
  for (const field of ["kpp", "ogrn", "legal_address"]) if (!nullableText(org[field])) fail("invalid_snapshot", "Реквизиты организации не подтверждены.");
  for (const field of ["course_id", "group_number", "program_title", "start_date", "end_date"]) if (!nullableText(group[field])) fail("invalid_snapshot", "Данные группы не подтверждены.");
  if (!nullableNumber(group.program_hours)) fail("invalid_snapshot", "Продолжительность программы не подтверждена.");
  if (input.course !== null) {
    const course = object(input.course);
    if (typeof course.id !== "string" || course.id !== group.course_id || course.organization_id !== scope.organizationId
      || typeof course.title !== "string" || !nullableText(course.duration) || !nullableNumber(course.frdo_duration_hours)) fail("invalid_snapshot", "Данные курса не подтверждены.");
  }
  if (!Array.isArray(input.profiles) || !Array.isArray(input.enrollments) || !Array.isArray(input.studentFrdoData) || input.studentFrdoData.length) fail("invalid_snapshot", "Состав снимка приказа не подтверждён.");
  for (const value of input.profiles) {
    const row = object(value);
    if (typeof row.user_id !== "string" || !UUID.test(row.user_id) || !nullableText(row.organization_id) || !nullableText(row.student_group_id)
      || !nullableText(row.archived_at) || !nullableText(row.full_name) || !nullableText(row.email)) fail("invalid_snapshot", "Состав участников не подтверждён.");
  }
  for (const value of input.enrollments) {
    const row = object(value);
    if (typeof row.id !== "string" || !UUID.test(row.id) || typeof row.user_id !== "string" || !UUID.test(row.user_id)
      || row.course_id !== group.course_id || typeof row.status !== "string" || !nullableNumber(row.progress)
      || !nullableText(row.completed_at)) fail("invalid_snapshot", "Зачисления участников не подтверждены.");
  }
  const metadata = object(input.metadata);
  if (metadata.documentStage !== "enrollment_prepared_unsigned" || metadata.responsiblePersonSource !== "goreltech-client-template-v20") fail("invalid_snapshot", "Этап документа и источник клиентских реквизитов не подтверждены.");
  requiredText(metadata.clientResponsiblePersonName, "Ответственное лицо", 300);
  requiredText(metadata.clientOrganizationShortName, "Сокращённое наименование организации", 300);
  return input as unknown as EnrollmentOrderSnapshot;
}
async function readFrozen(value: unknown, scope: EnrollmentOrderScope) {
  const input = object(value);
  if (input.organizationId !== scope.organizationId || input.groupId !== scope.groupId || input.actorId !== scope.actorId) fail("record_scope_mismatch", "Ответ не относится к выбранному пользователю, организации и группе.");
  const snapshot = readSnapshot(input.snapshot, scope);
  if (typeof input.snapshotCanonical !== "string") fail("invalid_snapshot_hash", "Отсутствует проверяемый снимок сервера.");
  let canonical: unknown;
  try { canonical = JSON.parse(input.snapshotCanonical); } catch { fail("invalid_snapshot_hash", "Снимок сервера не читается."); }
  const snapshotHash = hash(input.snapshotHash);
  if (stable(canonical) !== stable(snapshot) || await enrollmentOrderSha256(input.snapshotCanonical) !== snapshotHash) fail("invalid_snapshot_hash", "Контрольная сумма снимка не совпадает.");
  return { snapshot, snapshotCanonical: input.snapshotCanonical, snapshotHash };
}
export function enrollmentOrderEligibility(snapshot: EnrollmentOrderSnapshot): { issues: EnrollmentOrderIssue[]; canFinalize: boolean } {
  // The enrollment-only builder never interprets progress/completion. Keep nullable legacy progress
  // exactly as stored; this narrowing does not invent a zero or an attestation result.
  const facts = buildGroupDocumentFactRows({ docType: "enrollment_order", snapshot: snapshot as GroupDocumentFactsSnapshot });
  const issues: EnrollmentOrderIssue[] = facts.issues.map(({ code, field, message }) => ({ code, field, message }));
  const hours = [...new Set([snapshot.group.program_hours, snapshot.course?.frdo_duration_hours, snapshot.course?.duration]
    .filter((value) => value !== null && value !== undefined && /^-?\d+(?:\.\d+)?$/.test(String(value).trim()))
    .map(Number))];
  if (hours.length > 1 || hours.some((value) => value <= 0)) issues.push({ code: "program_hours_conflict", field: "program_hours", message: "Продолжительность программы в группе и курсе различается либо равна нулю. Уточните сохранённые часы перед оформлением приказа." });
  issues.push(...validateGroupDocumentPrerequisites({ docType: "enrollment_order", fillMode: "data", context: {
    org_name: snapshot.organization.name, group_number: facts.scalars.GROUP_NUMBER, program_title: facts.scalars.PROGRAM_TITLE,
    program_hours: facts.scalars.PROGRAM_HOURS, start_date: facts.scalars.START_DATE, end_date: facts.scalars.END_DATE,
    students_count: facts.rows.length, instructor_name: "", training_dates: [],
  } }));
  // Scan the original saved strings before the existing builder's trim, without leaking values.
  const strings: Array<[string, unknown]> = [
    ["organization.name", snapshot.organization.name], ["group.group_number", snapshot.group.group_number],
    ["group.program_title", snapshot.group.program_title], ["course.title", snapshot.course?.title],
    ...snapshot.profiles.map((profile, index): [string, unknown] => [`profiles[${index}].full_name`, profile.full_name]),
  ];
  for (const [field, value] of strings) if (typeof value === "string" && !xmlSafe(value)) issues.push({ code: "invalid_xml_text", field, message: `Поле «${field}» содержит символы, недопустимые в Word. Исправьте исходное значение.` });
  return { issues, canFinalize: issues.length === 0 };
}
export function enrollmentOrderFilePath(scope: EnrollmentOrderScope, operationId: string, sha: string): string {
  return `${scope.organizationId}/enrollment-orders/${scope.groupId}/${operationId}/${hash(sha)}.docx`;
}
export async function readEnrollmentOrderRecord(value: unknown, scope: EnrollmentOrderScope, operationId?: string, allowOtherActor = false): Promise<EnrollmentOrderRecord> {
  const input = object(value);
  const recordScope = allowOtherActor ? { ...scope, actorId: uuid(input.actorId, "record.actorId") } : scope;
  const frozen = await readFrozen(input, recordScope);
  const id = uuid(input.operationId, "operationId");
  if (operationId && id !== operationId) fail("operation_mismatch", "Сервер вернул другую операцию.");
  if (input.status !== "reserved" && input.status !== "completed") fail("invalid_status", "Статус операции не подтверждён.");
  if (!validDate(input.documentDate)) fail("invalid_date", "Дата приказа не подтверждена.");
  const documentNumber = requiredText(input.documentNumber, "Номер приказа", 100);
  if (!/^УЦ-[1-9]\d*\/\d{4}$/.test(documentNumber) || !documentNumber.endsWith(`/${input.documentDate.slice(0, 4)}`)) fail("invalid_number", "Номер приказа не подтверждён реестром.");
  if (hash(input.templateSha256) !== ENROLLMENT_ORDER_TEMPLATE_SHA256) fail("template_mismatch", "Версия оригинального шаблона не совпадает.");
  const result: EnrollmentOrderRecord = { ...recordScope, ...frozen, operationId: id, status: input.status, documentNumber,
    documentDate: input.documentDate, signatory: signatory(input.signatory), templateSha256: ENROLLMENT_ORDER_TEMPLATE_SHA256,
    filePath: null, docxSha256: null };
  if (input.status === "completed") {
    result.docxSha256 = hash(input.docxSha256);
    result.filePath = enrollmentOrderFilePath(scope, id, result.docxSha256);
    if (input.filePath !== result.filePath) fail("file_scope_mismatch", "Путь файла не совпадает с записью реестра.");
  } else if (input.filePath !== null || input.docxSha256 !== null) fail("invalid_status", "Незавершённая операция содержит неподтверждённый файл.");
  return result;
}
/** Only the retained enrollment template, exact frozen DB rows and explicit signatory. */
export function compileEnrollmentOrderDocumentXml(documentXml: string, manifest: GroupDocumentManifest, record: EnrollmentOrderRecord): string {
  if (manifest.template_id !== "goreltech.group.enrollment_order" || hash(manifest.template_sha256) !== ENROLLMENT_ORDER_TEMPLATE_SHA256) fail("template_mismatch", "Оригинальный шаблон приказа не подтверждён.");
  const eligibility = enrollmentOrderEligibility(record.snapshot);
  if (!eligibility.canFinalize) fail("prerequisites_missing", "Данные для приказа неполны. Перечитайте группу и проверьте замечания.");
  const facts = buildGroupDocumentFactRows({ docType: "enrollment_order", snapshot: record.snapshot as GroupDocumentFactsSnapshot });
  const signer = resolveDocumentSignatory(record.signatory, {});
  return compileGroupDocumentXml({ documentXml, manifest, snapshot: { rows: facts.rows, scalars: {
    ...facts.scalars, ...buildCanonicalDocumentMetadataScalars(record),
    ORG_SHORT_NAME: record.snapshot.metadata.clientOrganizationShortName, RESPONSIBLE_PERSON_NAME: record.snapshot.metadata.clientResponsiblePersonName,
    SIGNATORY_POSITION: signer.position, SIGNATORY_SHORT: signer.shortName,
  } } });
}
export interface EnrollmentOrderPorts {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  compile(record: EnrollmentOrderRecord): Promise<Uint8Array>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  download(path: string): Promise<Uint8Array>;
  signedUrl(path: string): Promise<string>;
}
export async function handleEnrollmentOrderAction(body: unknown, actorId: string, ports: EnrollmentOrderPorts): Promise<Record<string, unknown>> {
  const input = object(body);
  const scope: EnrollmentOrderScope = { actorId: uuid(actorId, "actorId"), organizationId: uuid(input.organizationId, "organizationId"), groupId: uuid(input.groupId, "groupId") };
  if (scope.organizationId !== GORELTECH_ORGANIZATION_ID) fail("wrong_organization", "Этот сценарий предназначен только для ГОРЭЛТЕХ.", 403);
  const action = input.action as EnrollmentOrderAction;
  if (!["preview", "finalize", "resume", "status", "list", "download"].includes(action)) fail("invalid_action", "Неизвестное действие.", 400);
  const args = { p_actor_id: scope.actorId, p_organization_id: scope.organizationId, p_group_id: scope.groupId };
  const response = { revision: ENROLLMENT_ORDER_REVISION, organizationId: scope.organizationId, groupId: scope.groupId };
  if (action === "preview") {
    const raw = await ports.rpc("preview_goreltech_enrollment_order", args);
    const frozen = await readFrozen(raw, scope);
    const { scalars } = buildGroupDocumentFactRows({ docType: "enrollment_order", snapshot: frozen.snapshot as GroupDocumentFactsSnapshot });
    return { ...response, ...frozen, ...enrollmentOrderEligibility(frozen.snapshot), documentSummary: {
      groupNumber: scalars.GROUP_NUMBER, programTitle: scalars.PROGRAM_TITLE, programHours: scalars.PROGRAM_HOURS,
      startDate: scalars.START_DATE, endDate: scalars.END_DATE,
    } };
  }
  if (action === "list" || action === "download") {
    const raw = await ports.rpc("list_goreltech_enrollment_orders", args);
    if (!Array.isArray(raw)) fail("invalid_list", "Список оформленных приказов не подтверждён.");
    // The SQL read policy permits organization-wide completed records; never mutation of another actor's intent.
    const records = await Promise.all(raw.map((record) => readEnrollmentOrderRecord(record, scope, undefined, true)));
    if (records.some((record) => record.status !== "completed") || new Set(records.map((record) => record.operationId)).size !== records.length) fail("invalid_list", "Список оформленных приказов содержит неподтверждённые записи.");
    if (action === "list") return { ...response, operations: records };
    const operationId = uuid(input.operationId, "operationId");
    const operation = records.find((record) => record.operationId === operationId);
    if (!operation?.filePath) fail("not_prepared", "Файл приказа ещё не подтверждён реестром этой организации и группы.");
    return { ...response, operationId, url: await ports.signedUrl(operation.filePath) };
  }
  const operationId = uuid(input.operationId, "operationId");
  const operationArgs = { ...args, p_operation_id: operationId };
  if ((action === "finalize" || action === "resume") && input.confirmed !== true) fail("confirmation_required", "Подтвердите данные приказа перед оформлением.", 400);
  // A retry always recovers its original frozen intent before considering any new body.
  const rawExisting = await ports.rpc("get_goreltech_enrollment_order", operationArgs);
  let operation = rawExisting === null ? null : await readEnrollmentOrderRecord(rawExisting, scope, operationId);
  if (action === "status") return { ...response, operation };
  if (action === "resume" && !operation) fail("operation_unknown", "Операция пока не найдена. Это не подтверждает её отмену. Проверьте статус позже; новый приказ не создавайте.");
  if (!operation) {
    const expectedSnapshotHash = hash(input.expectedSnapshotHash);
    if (!validDate(input.documentDate)) fail("invalid_date", "Укажите действительную дату приказа.", 400);
    const explicitSignatory = signatory(input.signatory);
    // Reserve RPC performs authorization, eligibility, fresh snapshot compare and number allocation atomically.
    const rawReserved = await ports.rpc("reserve_goreltech_enrollment_order", { ...operationArgs,
      p_expected_snapshot_hash: expectedSnapshotHash, p_document_date: input.documentDate,
      p_signatory: explicitSignatory, p_template_sha256: ENROLLMENT_ORDER_TEMPLATE_SHA256,
    });
    operation = await readEnrollmentOrderRecord(rawReserved, scope, operationId);
    if (operation.snapshotHash !== expectedSnapshotHash || operation.documentDate !== input.documentDate || stable(operation.signatory) !== stable(explicitSignatory)) fail("reserved_intent_mismatch", "Сервер сохранил другую версию данных. Проверьте статус этой операции перед повтором.");
  }
  if (operation.status === "completed") return { ...response, operation };
  if (!enrollmentOrderEligibility(operation.snapshot).canFinalize) fail("prerequisites_missing", "Сохранённый снимок неполон; файл не подготовлен. Обратитесь в поддержку с номером операции.");
  const bytes = await ports.compile(operation);
  const docxHash = await enrollmentOrderSha256(bytes);
  const filePath = enrollmentOrderFilePath(scope, operationId, docxHash);
  try { await ports.upload(filePath, bytes); }
  catch {
    // No overwrite/cleanup. A previous attempt may have uploaded successfully before a lost response.
    let stored: Uint8Array;
    try { stored = await ports.download(filePath); }
    catch { fail("upload_outcome_unknown", "Результат загрузки пока не подтверждён. Проверьте статус и продолжите эту же операцию; новый приказ не создавайте."); }
    if (await enrollmentOrderSha256(stored) !== docxHash) fail("immutable_file_conflict", "Существующий файл не совпадает с контрольной суммой. Файл не перезаписан; обратитесь в поддержку.");
  }
  const completed = await readEnrollmentOrderRecord(await ports.rpc("complete_goreltech_enrollment_order", {
    ...operationArgs, p_file_path: filePath, p_docx_sha256: docxHash,
  }), scope, operationId);
  if (completed.status !== "completed" || completed.filePath !== filePath || completed.docxSha256 !== docxHash
    || completed.snapshotHash !== operation.snapshotHash || completed.documentNumber !== operation.documentNumber
    || completed.documentDate !== operation.documentDate || stable(completed.signatory) !== stable(operation.signatory)) fail("completion_unconfirmed", "Результат оформления не подтверждён. Проверьте статус этой операции перед повтором.");
  return { ...response, operation: completed };
}
