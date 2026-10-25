import { createHash } from 'node:crypto';
import type { CopyData, CopyRecord, CopyHistory, CopyImport, CopyExportManifest, CopyExport, CopyScope } from '../contract.ts';

export const uid = (n: number) => '00000000-0000-4000-8000-' + n.toString(16).padStart(12, '0');
export const org = uid(1), actor = uid(2), group = uid(3), now = '2026-10-22T05:00:00.000Z';
export const sha = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex');
export const original = { kind: 'org_document_version' as const, document_id: uid(4), version_id: uid(5), content_hash: 'a'.repeat(64) };
export const capabilities = { can_read: true as const, can_write: true, can_create: true, can_import: true, can_inventory_local: true, can_export: true };
export const base = (scope: CopyScope = { kind: 'organization' }) => ({ schema_version: 1 as const, organization_id: org, scope, registry_revision: 101, capabilities: { ...capabilities, ...(scope.kind === 'group' ? { can_import: false, can_inventory_local: false } : {}) } });
export function data(n = 1): CopyData {
  return { copy_type: 'copy', declared_number: null, document_date: '2026-10-21', original: { ...original }, subject: { kind: 'none' }, recipient: { kind: 'external', name: 'Синтетический получатель ' + n, capacity: 'self' }, basis: { reason: 'archive', note: 'Проверка реестра', evidence: null }, notes: '' };
}
export function record(n = 1): CopyRecord {
  return { id: uid(100 + n), group_id: null, registration_id: 'КОП-2026/' + n.toString().padStart(4, '0'), sequence_year: 2026, sequence_number: n, revision: 1, archived: false, redacted: false, data: data(n), registered_at: now, recorded_by: actor, updated_at: now, subject_label: null, recipient_label: 'Синтетический получатель ' + n, original_label: null, original_available: false, recorded_by_label: 'Синтетический сотрудник', can_edit: false, can_archive: true, can_transfer: false, latest_transfer: null };
}
export function history(row: CopyRecord, revision = row.revision): CopyHistory {
  return { id: uid(10000 + row.sequence_number * 10 + revision), record_id: row.id, revision, action: revision === 1 ? 'create' : 'update', reason: 'Основание регистрации', snapshot: { data: structuredClone(row.data), archived: row.archived, latest_transfer: row.latest_transfer }, recorded_at: now, recorded_by: actor, recorded_by_label: 'Синтетический сотрудник' };
}
export function preview(length = 1): CopyImport {
  const source_raw = JSON.stringify(Array.from({ length }, (_, index) => ({ id: 'legacy-' + index, recipient_name: 'Исторический получатель ' + index })));
  return { id: uid(20), source_raw, source_sha256: sha(source_raw), preview_hash: 'b'.repeat(64), registry_revision: 101, status: 'preview', created_at: now, row_count: length, rows: Array.from({ length }, (_, index) => ({ index, source_digest: sha('row-' + index), legacy_id: 'legacy-' + index, conflicts: ['UNRESOLVED_ORIGINAL', 'UNRESOLVED_RECIPIENT'], valid: true, existing_id: null, candidate: { ...data(index), original: { kind: 'unresolved', document_type: 'certificate', document_number: 'reported-' + index, issue_date: '2026-10-21', explanation: 'Исторический источник без подтверждённой версии' } }, unknown_fields: [] })), report: null };
}
export function savedExport(records = [record()], scope: CopyScope = { kind: 'organization' }): CopyExport {
  const manifest: CopyExportManifest = { schema_version: 1, organization_id: org, scope, registry_revision: 101, captured_at: now, captured_by: actor, records, history: records.flatMap(row => Array.from({ length: row.revision }, (_, index) => history(row, index + 1))), counts: { records: records.length, history: records.reduce((sum, row) => sum + row.revision, 0) } };
  const manifest_json = ' \n' + JSON.stringify(manifest, null, 2) + '\n';
  const html = '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Копии</title><body><p>Зарегистрировано: ' + records.length + '</p></body></html>\n';
  return { id: uid(30), registry_revision: manifest.registry_revision, created_at: now, created_by: actor, record_count: manifest.counts.records, history_count: manifest.counts.history, manifest_bytes: new TextEncoder().encode(manifest_json).length, manifest_sha256: sha(manifest_json), html_bytes: new TextEncoder().encode(html).length, html_sha256: sha(html), manifest_json, html };
}
