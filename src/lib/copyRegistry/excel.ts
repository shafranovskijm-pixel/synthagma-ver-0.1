import { getXLSX } from '@/utils/xlsxHelper';
import { CopyRegistryError } from './errors.ts';
import { verifyCopyRegistryExport } from './export.ts';
import type { CopyExport, CopyScope } from './contract.ts';

/** Convenience workbook from a fresh authorized saved snapshot, never from a partial screen or localStorage. */
export async function downloadCopyRegistryExcel(readCurrentExport: () => Promise<CopyExport>, expected: { organizationId: string; scope: CopyScope; exportId: string }, current: () => boolean) {
  if (!current()) throw new CopyRegistryError('ACCESS_DENIED');
  const XLSX = await getXLSX();
  if (!current()) throw new CopyRegistryError('ACCESS_DENIED');
  const verified = await verifyCopyRegistryExport(await readCurrentExport(), expected, current);
  if (!current()) throw new CopyRegistryError('ACCESS_DENIED');
  const workbook = XLSX.utils.book_new();
  const records = verified.manifest.records.map(record => ({
    'Внутренний номер': record.registration_id,
    'Заявленный прежний номер': record.data.declared_number ?? '',
    'Тип': record.data.copy_type === 'copy' ? 'Копия' : 'Дубликат',
    'Получатель': record.recipient_label,
    'Участник оригинала': record.subject_label ?? '',
    'Оригинал': record.original_label ?? (record.data.original.kind === 'unresolved' ? record.data.original.document_number : 'Недоступен с текущими правами'),
    'Дата документа (сообщённая)': record.data.document_date,
    'Основание': record.data.basis.note,
    'Примечание': record.data.notes,
    'Архив': record.archived ? 'Да' : 'Нет',
    'Версия записи': record.revision,
    'Передача зафиксирована': record.latest_transfer ? 'Да' : 'Нет',
    'Дата передачи (сообщённая)': record.latest_transfer?.reported_date ?? '',
    'Способ передачи': record.latest_transfer?.method ?? '',
    'Сотрудник': record.recorded_by_label ?? record.recorded_by,
  }));
  const history = verified.manifest.history.map(entry => ({
    'ID записи': entry.record_id, 'Версия': entry.revision, 'Действие': entry.action,
    'Основание изменения': entry.reason, 'Время фиксации': entry.recorded_at,
    'Сотрудник': entry.recorded_by_label ?? entry.recorded_by ?? '',
    'Сохранённое состояние (JSON)': JSON.stringify(entry.snapshot),
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(records), 'Копии и дубликаты');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(history), 'История');
  if (!current()) throw new CopyRegistryError('ACCESS_DENIED');
  XLSX.writeFile(workbook, 'Журнал_копий_дубликатов_' + expected.exportId + '.xlsx');
}
