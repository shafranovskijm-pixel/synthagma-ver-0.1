import { getXLSX } from '@/utils/xlsxHelper';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import { registryExportSchema, registrySnapshotSchema, sameRegistryScope, registryBindingMatches, type RegistryExport, type RegistryFilters, type RegistryScope, type RegistryRecord } from './contract.ts';
import { DocumentRegistryError } from './errors.ts';
import { downloadRegistryBlob } from './files.ts';
import { captureDocumentOutputFence } from '@/lib/documents/outputFence';

export async function verifyRegistryExport(value: RegistryExport, expected: { organizationId: string; scope: RegistryScope; filters: RegistryFilters }, current: () => boolean) {
  if (!current()) throw new DocumentRegistryError('ACCESS_DENIED');
  const parsed = registryExportSchema.safeParse(value); if (!parsed.success) throw new DocumentRegistryError();
  const bytes = new TextEncoder().encode(value.manifest_json);
  if (bytes.length > 8 * 1024 * 1024 || bytes.length !== value.manifest_bytes || new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== value.manifest_json) throw new DocumentRegistryError();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (!current()) throw new DocumentRegistryError('ACCESS_DENIED');
  let raw: unknown; try { raw = JSON.parse(value.manifest_json); } catch { throw new DocumentRegistryError(); }
  const snapshotParse = registrySnapshotSchema.safeParse(raw); if (!snapshotParse.success) throw new DocumentRegistryError();
  const snapshot = snapshotParse.data;
  if (hash !== value.manifest_sha256 || !sameCopyValue(snapshot, value.snapshot) || snapshot.organization_id !== expected.organizationId || !sameRegistryScope(snapshot.scope as RegistryScope, expected.scope) || !sameCopyValue(snapshot.filters, expected.filters)
    || snapshot.record_count !== snapshot.records.length || snapshot.event_count !== snapshot.events.length || new Set(snapshot.records.map(row => row.id)).size !== snapshot.records.length) throw new DocumentRegistryError();
  const histories = new Map(snapshot.records.map(row => [row.id, [] as typeof snapshot.events]));
  for (const event of snapshot.events) { const history = histories.get(event.record_id); if (!history || event.revision !== history.length + 1 || !registryBindingMatches(event.snapshot.data as RegistryRecord['data'], event.snapshot.context_binding as RegistryRecord['context_binding'], expected.organizationId)) throw new DocumentRegistryError(); history.push(event); }
  for (const row of snapshot.records) { const history = histories.get(row.id)!; const last = history[history.length - 1]; if (!registryBindingMatches(row.data as RegistryRecord['data'], row.context_binding as RegistryRecord['context_binding'], expected.organizationId) || history.length !== row.revision || !last || !sameCopyValue(last.snapshot, { data: row.data, status: row.status, context_binding: row.context_binding })) throw new DocumentRegistryError(); }
  if (!current()) throw new DocumentRegistryError('ACCESS_DENIED');
  return { snapshot: value.snapshot, manifest_json: value.manifest_json };
}
export const REGISTRY_PREPARED_EXPORT_TTL_MS = 5 * 60 * 1000;
export interface PreparedRegistryExport {
  readonly format: 'json' | 'xlsx'; readonly filename: string; readonly byteSize: number;
  readonly recordCount: number; readonly eventCount: number; readonly manifestHash: string;
  readonly preparedAt: number; readonly expiresAt: number;
  available: () => boolean; download: () => void; dispose: () => void;
}
/** Verified bytes stay in memory only; no persistent href, storage cache or browser-save claim. */
export async function prepareRegistryExport(readFresh: () => Promise<RegistryExport>, expected: { organizationId: string; scope: RegistryScope; filters: RegistryFilters }, format: 'json' | 'xlsx', current: () => boolean): Promise<PreparedRegistryExport> {
  const outputFence = captureDocumentOutputFence(), captured = structuredClone(expected);
  const requireCurrent = () => {
    if (!current()) throw new DocumentRegistryError('ACCESS_DENIED');
    try { outputFence(); } catch { throw new DocumentRegistryError('ACCESS_DENIED'); }
  };
  requireCurrent();
  const XLSX = format === 'xlsx' ? await getXLSX() : null;
  requireCurrent();
  const value = await readFresh(); requireCurrent();
  const verified = await verifyRegistryExport(value, captured, () => { requireCurrent(); return true; });
  requireCurrent();
  let blob: Blob | null;
  const filename = format === 'json' ? 'Реестр_документов.json' : 'Журнал_регистрации_документов.xlsx';
  if (format === 'json') blob = new Blob([verified.manifest_json], { type: 'application/json;charset=utf-8' });
  else {
  const workbook = XLSX!.utils.book_new();
  const rows = verified.snapshot.records.map(row => ({ 'Внутренний номер': row.registration_id, 'Заявленный номер документа': row.data.declared_document_number ?? '', 'Направление': row.data.direction === 'incoming' ? 'Входящий' : 'Исходящий', 'Тип': row.data.document_type, 'Наименование': row.data.title, 'Дата документа (сообщённая)': row.data.document_date, 'Отправитель': row.sender_label, 'Получатель': row.recipient_label, 'Ученик': row.subject_label ?? '', 'Связанный контекст': row.context_label, 'Файл': row.source_label ?? 'Недоступен с текущими правами', 'Версия файла': row.data.source.kind === 'org_document_version' ? row.data.source.version_id : row.data.source.artifact_id, 'Состояние': row.status === 'archived' ? 'Архив' : 'Зарегистрирован', 'Версия записи': row.revision, 'Дата регистрации': row.registered_at, 'Сотрудник': row.recorded_by_label ?? '', 'Примечание': row.data.notes }));
  const events = verified.snapshot.events.map(row => ({ 'Запись': row.record_id, 'Версия': row.revision, 'Действие': row.action, 'Основание': row.reason, 'Зафиксировано': row.recorded_at, 'Сотрудник': row.recorded_by_label ?? '', 'Состояние (JSON)': JSON.stringify(row.snapshot) }));
  XLSX!.utils.book_append_sheet(workbook, XLSX!.utils.json_to_sheet(rows), 'Регистрация'); XLSX!.utils.book_append_sheet(workbook, XLSX!.utils.json_to_sheet(events), 'История');
  requireCurrent();
  const output: unknown = XLSX!.write(workbook, { bookType: 'xlsx', type: 'array' });
  const bytes = output instanceof ArrayBuffer ? new Uint8Array(output) : ArrayBuffer.isView(output) ? new Uint8Array(output.buffer, output.byteOffset, output.byteLength).slice() : null;
  if (!bytes || bytes.length < 4 || bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) throw new DocumentRegistryError();
  if (bytes.length > 50 * 1024 * 1024) throw new DocumentRegistryError('LIMIT_EXCEEDED');
  blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  requireCurrent();
  const preparedAt = Date.now(), expiresAt = preparedAt + REGISTRY_PREPARED_EXPORT_TTL_MS, byteSize = blob.size;
  const dispose = () => { blob = null; };
  const available = () => {
    if (!blob || Date.now() >= expiresAt) { dispose(); return false; }
    try { requireCurrent(); return true; } catch { dispose(); return false; }
  };
  return Object.freeze({ format, filename, byteSize, recordCount: verified.snapshot.record_count, eventCount: verified.snapshot.event_count,
    manifestHash: value.manifest_sha256, preparedAt, expiresAt, available, dispose,
    download: () => {
      if (!available()) throw new DocumentRegistryError('ACCESS_DENIED');
      downloadRegistryBlob(blob!, filename, available);
    },
  });
}
/** Compatibility for existing one-shot callers; the journal keeps a scoped prepared result. */
export async function downloadRegistryExport(readFresh: () => Promise<RegistryExport>, expected: { organizationId: string; scope: RegistryScope; filters: RegistryFilters }, format: 'json' | 'xlsx', current: () => boolean) {
  const prepared = await prepareRegistryExport(readFresh, expected, format, current);
  try { prepared.download(); } finally { prepared.dispose(); }
}
