import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CopyRegistryModel } from '@/hooks/useCopyRegistry';
import { copyRegistryMessages, normalizeCopyRegistryError } from '@/lib/copyRegistry/errors';
import type { CopyImport, CopyImportDecision, CopyMutation } from '@/lib/copyRegistry/contract';
import { assertCopyImportSourceCurrent, captureBrowserCopySource, captureCopyFileSource, CopySourceError, downloadCopySourceBackup, type CopyImportSource } from '@/lib/copyRegistry/legacySource';
import { CopyChoice } from './CopyRegistryForm';

const conflicts: Record<string, string> = {
  INVALID_JSON: 'Источник не читается как JSON', UNSUPPORTED_FORMAT: 'Неподдерживаемый формат', INVALID_ROW: 'Поля строки не подходят для переноса',
  DUPLICATE_LOCAL_ID: 'Повторяется локальный идентификатор', NUMBER_CLAIM_CONFLICT: 'Заявленный номер совпал с другой строкой', ALREADY_IMPORTED: 'Точный источник уже переносили',
  UNRESOLVED_ORIGINAL: 'Оригинал не связан с проверенной версией', UNRESOLVED_RECIPIENT: 'Получатель указан как исторические сведения', UNKNOWN_FIELDS: 'Есть дополнительные поля — сохранятся в исходнике',
};
const sourceMessages: Record<CopySourceError['code'], string> = {
  ACCESS_DENIED: 'Доступ к локальному источнику не подтверждён.', SOURCE_CHANGED: 'Источник в браузере изменился. Снимите новый предпросмотр; прежние данные не перезаписаны.',
  SOURCE_UNAVAILABLE: 'Не удалось прочитать источник. Данные не очищались.', TOO_LARGE: 'Источник больше 2 МБ — безопасного размера одной операции. Он сохранён без изменений.',
  INVALID_UTF8: 'Источник содержит символы, которые нельзя сохранить в UTF-8 без изменений. Он не исправлялся и не переносился автоматически.',
};
function message(error: unknown) { return error instanceof CopySourceError ? sourceMessages[error.code] : copyRegistryMessages[normalizeCopyRegistryError(error).code]; }

export function CopyRegistryImport({ model, source, preview, onSource, onResult }: {
  model: CopyRegistryModel; source: CopyImportSource | null; preview: CopyImport | null;
  onSource: (source: CopyImportSource | null) => void; onResult: (result: CopyMutation) => void;
}) {
  const id = useId(), epoch = useRef(0), mounted = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState(''), [acknowledged, setAcknowledged] = useState(false), [page, setPage] = useState(0);
  const [choices, setChoices] = useState<Record<number, CopyImportDecision['choice']>>({});
  const current = () => mounted.current && model.scopeCurrent();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; }; }, []);
  useEffect(() => { setChoices({}); setReason(''); setAcknowledged(false); setPage(0); setError(null); }, [preview?.id, preview?.status, source?.sha256]);
  const disabled = busy || model.saving || model.pending;
  const capture = async (file?: File) => {
    if (!current() || !model.capabilities?.can_inventory_local || disabled) return;
    const ticket = ++epoch.current; setBusy(true); setError(null);
    try {
      const next = file ? await captureCopyFileSource(file, current) : await captureBrowserCopySource(model.organizationId, model.capabilities.can_inventory_local && model.registryScope.kind === 'organization', current);
      if (!current() || ticket !== epoch.current) return;
      onSource(next); if (next === null) toast.info('В этом браузере нет прежнего локального журнала.');
    } catch (failure) { if (current() && ticket === epoch.current) setError(message(failure)); }
    finally { if (current() && ticket === epoch.current) setBusy(false); }
  };
  const showPreview = async () => {
    if (!source || !current() || disabled || !model.capabilities?.can_import) return;
    setError(null);
    try {
      assertCopyImportSourceCurrent(source, model.organizationId, current);
      const result = await model.mutate(0, { action: 'preview_import', source_raw: source.raw, source_sha256: source.sha256 });
      if (current()) onResult(result);
    } catch (failure) { if (current()) setError(message(failure)); }
  };
  const apply = async () => {
    if (!source || !preview || preview.status !== 'preview' || !current() || disabled || !acknowledged || !reason.trim() || !preview.rows.length || !model.capabilities?.can_import) return;
    try {
      assertCopyImportSourceCurrent(source, model.organizationId, current);
      const decisions = preview.rows.map(row => {
        const choice = choices[row.index] ?? 'skip';
        return { index: row.index, choice, reason: reason.trim(), existing_id: choice === 'reuse' ? row.existing_id : null };
      });
      const result = await model.mutate(preview.registry_revision, { action: 'apply_import', import_id: preview.id, source_sha256: source.sha256, preview_hash: preview.preview_hash, decisions });
      if (current()) onResult(result);
    } catch (failure) { if (current()) setError(message(failure)); }
  };
  const rows = preview?.rows ?? [], visibleRows = rows.slice(page * 25, (page + 1) * 25);
  const wholeSourceRefused = rows.length === 1 && !rows[0].valid && rows[0].candidate === null && rows[0].conflicts.some(code => code === 'INVALID_JSON' || code === 'UNSUPPORTED_FORMAT');
  const selected = rows.filter(row => (choices[row.index] ?? 'skip') === 'import').length;
  const reused = rows.filter(row => (choices[row.index] ?? 'skip') === 'reuse').length;
  const backup = () => { if (!source) return; try { downloadCopySourceBackup(source, current); } catch (failure) { if (current()) setError(message(failure)); } };
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Прежние записи из браузера или файла сначала проходят предпросмотр. Локальный исходник не меняется и не удаляется. Неподтверждённые связи и прежние номера остаются историческими сведениями.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => capture()} disabled={disabled || !model.capabilities?.can_inventory_local}>Проверить прежний журнал этого браузера</Button>
      <div><Label htmlFor={id + '-file'} className="sr-only">Файл прежнего журнала</Label><Input id={id + '-file'} type="file" accept=".json,.txt,application/json,text/plain" disabled={disabled || !model.capabilities?.can_import} onChange={event => { const file = event.target.files?.[0]; if (file) void capture(file); event.target.value = ''; }} className="max-w-xs rounded-xl" /></div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {source && <div className="rounded-xl border border-border p-4 space-y-3">
      <p className="text-sm">Источник: <strong>{source.name}</strong>. Сохранён точно; его можно скачать перед переносом.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={backup} disabled={disabled}><Download className="w-4 h-4 mr-2" />Скачать исходник без изменений</Button><Button onClick={showPreview} disabled={disabled || !model.capabilities?.can_import}><Upload className="w-4 h-4 mr-2" />{preview ? 'Обновить предпросмотр' : 'Показать предпросмотр переноса'}</Button></div>
    </div>}
    {preview && <>
      <div className="rounded-xl border border-border p-4 space-y-2"><p className="font-medium">{wholeSourceRefused ? 'Источник отклонён целиком; ниже показана диагностика формата.' : `Строк в исходнике: ${preview.row_count}`}</p><p className="text-xs text-muted-foreground">Весь исходный текст и дополнительные поля сохранены на сервере. Импорт не подтверждает оригинал, личность получателя или факт выдачи.</p>
        {preview.report && <p role="status" className="text-sm">Отчёт: перенесено {preview.report.imported}, повторно использовано {preview.report.reused}, пропущено {preview.report.skipped}.</p>}
      </div>
      {!preview.report && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setChoices(Object.fromEntries(rows.map(row => [row.index, row.valid && !row.existing_id ? 'import' : row.existing_id ? 'reuse' : 'skip']))); setAcknowledged(false); }} disabled={disabled}>Выбрать подходящие строки из всего источника</Button><Button variant="ghost" onClick={() => { setChoices({}); setAcknowledged(false); }} disabled={disabled}>Пропустить все</Button></div>}
      <p className="text-xs text-muted-foreground">{rows.length ? `Показаны строки ${page * 25 + 1}–${Math.min((page + 1) * 25, rows.length)} из ${rows.length}.` : 'В источнике нет строк.'} Решения применяются ко всему предпросмотру, включая другие страницы.</p>
      <div className="rounded-xl border border-border overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Строка</TableHead><TableHead>Исторические сведения</TableHead><TableHead>Что требует проверки</TableHead><TableHead>Решение</TableHead></TableRow></TableHeader><TableBody>{visibleRows.map(row => <TableRow key={row.index}>
        <TableCell>{row.index + 1}</TableCell><TableCell><p>{row.candidate?.recipient.kind === 'external' ? row.candidate.recipient.name : row.candidate ? 'Связь с участником' : 'Неразобранная строка'}</p><p className="text-xs text-muted-foreground">Заявленный номер: {row.candidate?.declared_number ?? 'не указан'}</p></TableCell>
        <TableCell><div className="space-y-1">{row.conflicts.map((code, index) => <p key={code + index} className="text-xs text-muted-foreground">{conflicts[code] ?? code}</p>)}{row.unknown_fields.length > 0 && <p className="text-xs text-muted-foreground">Дополнительные поля: {row.unknown_fields.join(', ')}</p>}{!row.valid && <Badge variant="outline">Перенос этой строки недоступен</Badge>}</div></TableCell>
        <TableCell>{preview.report ? <span className="text-sm">{{ import: 'Перенесено', skip: 'Пропущено', reuse: 'Повторно использовано' }[preview.report.decisions.find(decision => decision.index === row.index)?.choice ?? 'skip']}</span> : <CopyChoice label={'Решение для строки ' + (row.index + 1)} value={choices[row.index] ?? 'skip'} options={[{ value: 'skip', label: 'Пропустить' }, ...(row.valid ? [{ value: 'import', label: 'Сохранить как историческую запись' }] : []), ...(row.existing_id ? [{ value: 'reuse', label: 'Использовать уже перенесённую запись' }] : [])]} onChange={choice => { setChoices(previous => ({ ...previous, [row.index]: choice as CopyImportDecision['choice'] })); setAcknowledged(false); }} disabled={disabled} />}</TableCell>
      </TableRow>)}</TableBody></Table></div>
      {rows.length > 25 && <div className="flex items-center gap-2"><Button variant="outline" onClick={() => setPage(value => value - 1)} disabled={page === 0}>Предыдущие строки</Button><Button variant="outline" onClick={() => setPage(value => value + 1)} disabled={(page + 1) * 25 >= rows.length}>Следующие строки</Button></div>}
      {preview.status === 'preview' && <div className="space-y-3 rounded-xl border border-border p-4">
        <Label htmlFor={id + '-reason'}>Общее основание решений для всех строк *</Label><Textarea id={id + '-reason'} value={reason} maxLength={2000} onChange={event => { setReason(event.target.value); setAcknowledged(false); }} disabled={disabled} rows={3} className="rounded-xl" />
        <p className="text-sm">Будет перенесено: {selected}; использовано существующих: {reused}; пропущено: {rows.length - selected - reused}.</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={disabled} className="mt-1" /><span>Подтверждаю решения для всех строк. Неподтверждённые сведения сохранятся с исторической пометкой, исходник останется без изменений.</span></label>
        <Button onClick={apply} disabled={disabled || !model.capabilities?.can_import || !acknowledged || !reason.trim() || rows.length === 0}>Подтвердить перенос и сохранить отчёт</Button>
      </div>}
    </>}
  </div>;
}
