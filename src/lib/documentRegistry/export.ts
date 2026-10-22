import { getXLSX } from '@/utils/xlsxHelper';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import { registryExportSchema, registrySnapshotSchema, sameRegistryScope, type RegistryExport, type RegistryFilters, type RegistryScope } from './contract';
import { DocumentRegistryError } from './errors';
import { downloadRegistryBlob } from './files';

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
  for (const event of snapshot.events) { const history = histories.get(event.record_id); if (!history || event.revision !== history.length + 1 || event.snapshot.context_binding.organization_id !== expected.organizationId) throw new DocumentRegistryError(); history.push(event); }
  for (const row of snapshot.records) { const history = histories.get(row.id)!; const last = history[history.length - 1]; if (row.context_binding.organization_id !== expected.organizationId || history.length !== row.revision || !last || !sameCopyValue(last.snapshot, { data: row.data, status: row.status, context_binding: row.context_binding })) throw new DocumentRegistryError(); }
  if (!current()) throw new DocumentRegistryError('ACCESS_DENIED');
  return { snapshot: value.snapshot, manifest_json: value.manifest_json };
}
export async function downloadRegistryExport(readFresh: () => Promise<RegistryExport>, expected: { organizationId: string; scope: RegistryScope; filters: RegistryFilters }, format: 'json' | 'xlsx', current: () => boolean) {
  if (!current()) throw new DocumentRegistryError('ACCESS_DENIED');
  const XLSX = format === 'xlsx' ? await getXLSX() : null;
  if (!current()) throw new DocumentRegistryError('ACCESS_DENIED');
  const verified = await verifyRegistryExport(await readFresh(), expected, current);
  if (format === 'json') { downloadRegistryBlob(new Blob([verified.manifest_json], { type: 'application/json;charset=utf-8' }), 'Реестр_документов.json', current); return; }
  const workbook = XLSX!.utils.book_new();
  const rows = verified.snapshot.records.map(row => ({ 'Внутренний номер': row.registration_id, 'Заявленный номер документа': row.data.declared_document_number ?? '', 'Направление': row.data.direction === 'incoming' ? 'Входящий' : 'Исходящий', 'Тип': row.data.document_type, 'Наименование': row.data.title, 'Дата документа (сообщённая)': row.data.document_date, 'Отправитель': row.sender_label, 'Получатель': row.recipient_label, 'Ученик': row.subject_label ?? '', 'Связанный контекст': row.context_label, 'Файл': row.source_label ?? 'Недоступен с текущими правами', 'Версия файла': row.data.source.version_id, 'Состояние': row.status === 'archived' ? 'Архив' : 'Зарегистрирован', 'Версия записи': row.revision, 'Дата регистрации': row.registered_at, 'Сотрудник': row.recorded_by_label ?? '', 'Примечание': row.data.notes }));
  const events = verified.snapshot.events.map(row => ({ 'Запись': row.record_id, 'Версия': row.revision, 'Действие': row.action, 'Основание': row.reason, 'Зафиксировано': row.recorded_at, 'Сотрудник': row.recorded_by_label ?? '', 'Состояние (JSON)': JSON.stringify(row.snapshot) }));
  XLSX!.utils.book_append_sheet(workbook, XLSX!.utils.json_to_sheet(rows), 'Регистрация'); XLSX!.utils.book_append_sheet(workbook, XLSX!.utils.json_to_sheet(events), 'История');
  if (!current()) throw new DocumentRegistryError('ACCESS_DENIED'); XLSX!.writeFile(workbook, 'Журнал_регистрации_документов.xlsx');
}
