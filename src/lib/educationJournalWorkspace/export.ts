import { EducationJournalError, readEducationJournalWorkspace, requireEducationJournalScope, type EducationJournalRequestScope } from './client';
import { journalLabels, type EducationJournalRow, type EducationJournalRowsRead, type EducationJournalType } from './contract';

type Reader = typeof readEducationJournalWorkspace;
export async function collectEducationJournalExtract(scope: EducationJournalRequestScope, journalType: EducationJournalType, read: Reader = readEducationJournalWorkspace) {
  requireEducationJournalScope(scope);
  let after: string | null = null;
  let first: EducationJournalRowsRead | null = null;
  const rows: EducationJournalRow[] = [], rowIds = new Set<string>(), cursors = new Set<string>();
  do {
    const value = await read(scope, { kind: 'rows', journal_type: journalType, after, limit: 100, snapshot_key: first?.snapshot_key ?? null });
    requireEducationJournalScope(scope);
    if (value.kind !== 'rows' || !value.capabilities.can_export) throw new EducationJournalError('ACCESS_DENIED');
    if (!first) first = value;
    if (value.snapshot_key !== first.snapshot_key || value.total_count !== first.total_count || JSON.stringify(value.context) !== JSON.stringify(first.context)) throw new EducationJournalError('SOURCE_CHANGED');
    if (value.total_count > 50000) throw new EducationJournalError('LIMIT_EXCEEDED');
    for (const row of value.rows) {
      if (rowIds.has(row.id)) throw new EducationJournalError('SOURCE_CHANGED');
      rowIds.add(row.id); rows.push(row);
    }
    if (rows.length > first.total_count) throw new EducationJournalError('SOURCE_CHANGED');
    after = value.next_cursor;
    if (after !== null) { if (cursors.has(after) || !value.rows.length) throw new EducationJournalError(); cursors.add(after); }
  } while (after !== null);
  if (!first || rows.length !== first.total_count) throw new EducationJournalError('SOURCE_CHANGED');
  requireEducationJournalScope(scope);
  return { page: first, rows };
}
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const date = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU', { timeZone: 'UTC' }) : 'Не указана';
export function educationJournalExtractHtml(value: { page: EducationJournalRowsRead; rows: EducationJournalRow[] }): string {
  const { page, rows } = value;
  const context = [page.context.student?.label, page.context.enrollment?.course_label, page.context.group?.label].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Выписка — ${escape(journalLabels[page.journal_type])}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;color:#181824}h1{font-size:25px}table{width:100%;border-collapse:collapse}td,th{padding:9px;border:1px solid #ccc;text-align:left;vertical-align:top}th{background:#f5f5fa}.muted{color:#555;font-size:12px}@media print{body{margin:0;max-width:none}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><h1>Выписка: ${escape(journalLabels[page.journal_type])}</h1><p>${escape(page.context.organization.label)}</p><p>${escape(context || 'Все записи выбранной области')}</p><p class="muted">По данным на ${escape(date(page.observed_at))} UTC. Даты событий — UTC. Записей: ${rows.length}.</p><p class="muted">Фактическая выписка из системы. Подпись и заверение не проставлены. Состав журналов определяется программой и локальными актами центра.</p>${page.context.group ? '<p class="muted">Цифровая активность без исторической привязки к группе отбирается по её текущему составу; это отмечено в источнике записи.</p>' : ''}<p class="muted">Версия выборки: ${escape(page.snapshot_key)}.</p><table><thead><tr><th>Дата события</th><th>Ученик</th><th>Обучение / группа</th><th>Запись</th><th>Результат</th><th>Источник</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(date(row.event_at))}</td><td>${escape(row.student_label)}</td><td>${escape([row.course_label, row.group_label].filter(Boolean).join(' · ') || 'Не указано')}</td><td>${escape(row.title)}</td><td>${escape(row.result ?? 'Не указан')}</td><td>${escape(row.source_label)}<br><span class="muted">Источник: ${escape(row.source_id)}</span>${row.source_revision !== null ? `<br><span class="muted">Версия ${row.source_revision}</span>` : ''}</td></tr>`).join('')}</tbody></table></body></html>`;
}
export function downloadEducationJournalExtract(scope: EducationJournalRequestScope, value: { page: EducationJournalRowsRead; rows: EducationJournalRow[] }) {
  requireEducationJournalScope(scope);
  const url = URL.createObjectURL(new Blob([educationJournalExtractHtml(value)], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = educationJournalExtractFilename(value.page);
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function educationJournalExtractFilename(page: EducationJournalRowsRead): string {
  const clean = (value: string) => value.replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
  const subject = page.context.student?.label || page.context.group?.label || page.context.organization.label;
  return `Выписка_${clean(subject)}_${clean(journalLabels[page.journal_type])}_${page.observed_at.slice(0, 10)}.html`;
}
