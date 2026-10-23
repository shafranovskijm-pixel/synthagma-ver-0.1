import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowLeft, Calendar as CalendarIcon, Copy, Download, FileSpreadsheet, FileText, History, Pencil, Plus, RotateCw, Search, Truck, Upload, User } from 'lucide-react';
import { format, parseISO, startOfYear, endOfYear, isWithinInterval } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { cn } from '@/lib/utils';
import { useCopyRegistry, type CopyRegistryModel } from '@/hooks/useCopyRegistry';
import { copyTransferSchema, type CopyExportSummary, type CopyHistory, type CopyImport, type CopyImportSummary, type CopyMutation, type CopyRecord, type CopyScope, type CopyTransfer } from '@/lib/copyRegistry/contract';
import { copyRegistryMessages, normalizeCopyRegistryError } from '@/lib/copyRegistry/errors';
import { downloadVerifiedCopyRegistryExport, verifyCopyRegistryExport } from '@/lib/copyRegistry/export';
import { downloadCopyRegistryExcel } from '@/lib/copyRegistry/excel';
import type { CopyImportSource } from '@/lib/copyRegistry/legacySource';
import { CopyChoice, CopyRegistryForm, COPY_REASONS, type CopyOriginalChoice, type CopyPersonChoice } from './CopyRegistryForm';
import { CopyRegistryImport } from './CopyRegistryImport';

const transferLabels: Record<CopyTransfer['method'], string> = { in_person: 'Лично', mail: 'Почтой', electronic: 'Электронно', other: 'Иной способ' };
const historyLabels: Record<CopyHistory['action'], string> = { create: 'Добавление', update: 'Исправление', archive: 'Перенос в архив', transfer: 'Сообщение о передаче', import: 'Перенос исторических сведений' };
const displayDate = (value: string) => format(parseISO(value), 'dd.MM.yyyy', { locale: ru });

export function ServerCopiesDuplicatesJournal({ organizationId, registryScope = { kind: 'organization' }, onClose }: { organizationId: string; registryScope?: CopyScope; onClose: () => void }) {
  const model = useCopyRegistry(organizationId, registryScope);
  // Re-mount all sensitive form/import/history state when actor/scope or server read authority changes.
  return <CopyRegistryWorkspace key={model.contextKey + '|capabilities:' + JSON.stringify(model.capabilities)} model={model} onClose={onClose} />;
}

function CopyRegistryWorkspace({ model, onClose }: { model: CopyRegistryModel; onClose: () => void }) {
  const [search, setSearch] = useState(''), [copyType, setCopyType] = useState('all'), [showArchived, setShowArchived] = useState(false);
  const [dates, setDates] = useState({ from: startOfYear(new Date()), to: endOfYear(new Date()) });
  const [editor, setEditor] = useState<{ record: CopyRecord | null } | null>(null);
  const [action, setAction] = useState<{ kind: 'archive' | 'transfer'; record: CopyRecord } | null>(null);
  const [actionReason, setActionReason] = useState(''), [actionError, setActionError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<CopyTransfer>({ method: 'in_person', reported_date: format(new Date(), 'yyyy-MM-dd'), note: '', evidence: null });
  const [originals, setOriginals] = useState<CopyOriginalChoice[]>([]), [originalsNext, setOriginalsNext] = useState<string | null>(null);
  const [people, setPeople] = useState<CopyPersonChoice[]>([]), [peopleNext, setPeopleNext] = useState<string | null>(null);
  const [exports, setExports] = useState<CopyExportSummary[]>([]), [exportsNext, setExportsNext] = useState<string | null>(null);
  const [imports, setImports] = useState<CopyImportSummary[]>([]), [importsNext, setImportsNext] = useState<string | null>(null);
  const [auxError, setAuxError] = useState<string | null>(null), [auxBusy, setAuxBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false), [importSource, setImportSource] = useState<CopyImportSource | null>(null), [importPreview, setImportPreview] = useState<CopyImport | null>(null);
  const [history, setHistory] = useState<{ record: CopyRecord; rows: CopyHistory[]; next: number | null; loading: boolean; error: string | null } | null>(null);
  const historyEpoch = useRef(0), importEpoch = useRef(0), mounted = useRef(true), auxEpoch = useRef(0), actionId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; historyEpoch.current++; importEpoch.current++; auxEpoch.current++; }; }, []);
  const current = () => mounted.current && model.scopeCurrent();
  const disabled = model.saving || model.pending || model.loading;
  const caps = model.capabilities;
  const loadAux = async () => {
    if (!current() || !caps?.can_read) return;
    const ticket = ++auxEpoch.current; setAuxBusy(true); setAuxError(null);
    const requests = [
      ...(caps.can_create || model.records.some(record => record.can_edit || record.can_transfer) ? [model.read({ kind: 'originals', after_id: null, limit: 100 }), model.read({ kind: 'people', after_id: null, limit: 100 })] : []),
      ...(caps.can_export ? [model.read({ kind: 'exports', after_id: null, limit: 100 })] : []),
      ...(caps.can_inventory_local ? [model.read({ kind: 'imports', after_id: null, limit: 100 })] : []),
    ];
    const results = await Promise.allSettled(requests);
    if (!current() || ticket !== auxEpoch.current) return;
    for (const result of results) {
      if (result.status === 'rejected') { setAuxError(copyRegistryMessages[normalizeCopyRegistryError(result.reason).code]); continue; }
      const value = result.value;
      if (value.kind === 'originals') { setOriginals(value.originals); setOriginalsNext(value.next_after_id); }
      if (value.kind === 'people') { setPeople(value.people); setPeopleNext(value.next_after_id); }
      if (value.kind === 'exports') { setExports(value.exports); setExportsNext(value.next_after_id); }
      if (value.kind === 'imports') { setImports(value.imports); setImportsNext(value.next_after_id); }
    }
    setAuxBusy(false);
  };
  useEffect(() => { void loadAux(); }, [model.read, caps?.can_create, caps?.can_export, caps?.can_inventory_local]);
  const moreAux = async (kind: 'originals' | 'people' | 'exports' | 'imports') => {
    const after = { originals: originalsNext, people: peopleNext, exports: exportsNext, imports: importsNext }[kind];
    if (!after || !current() || auxBusy || disabled) return;
    setAuxBusy(true); setAuxError(null);
    try {
      const result = await model.read({ kind, after_id: after, limit: 100 });
      if (!current()) return;
      if (result.kind === 'originals') { setOriginals(previous => [...previous, ...result.originals]); setOriginalsNext(result.next_after_id); }
      if (result.kind === 'people') { setPeople(previous => [...previous, ...result.people]); setPeopleNext(result.next_after_id); }
      if (result.kind === 'exports') { setExports(previous => [...previous, ...result.exports]); setExportsNext(result.next_after_id); }
      if (result.kind === 'imports') { setImports(previous => [...previous, ...result.imports]); setImportsNext(result.next_after_id); }
    } catch (error) { if (current()) setAuxError(copyRegistryMessages[normalizeCopyRegistryError(error).code]); }
    finally { if (current()) setAuxBusy(false); }
  };
  const acceptResult = (result: CopyMutation) => {
    if (!current()) return;
    if ('record' in result) { setEditor(null); setAction(null); toast.success(result.kind === 'archive' ? 'Запись сохранена в архиве; номер и история остались в реестре.' : result.kind === 'transfer' ? 'Сообщение о передаче сохранено.' : 'Запись сохранена в общем реестре.'); }
    if ('import' in result) {
      importEpoch.current++;
      setImportPreview(result.import); setImportOpen(true);
      setImportSource(previous => previous?.sha256 === result.import.source_sha256 && previous.raw === result.import.source_raw ? previous
        : { origin: 'file', name: 'Сохранённый исходник переноса', raw: result.import.source_raw, sha256: result.import.source_sha256 });
      if (result.kind === 'apply_import') {
        toast.success('Отчёт переноса сохранён. Исходник не изменён.');
        void (async () => {
          try { await model.reload(); if (current()) await loadAux(); }
          catch (error) { if (current()) toast.error(copyRegistryMessages[normalizeCopyRegistryError(error).code]); }
        })();
      } else void loadAux();
    }
    if ('export' in result) { setExports(previous => [result.export, ...previous.filter(item => item.id !== result.export.id)]); toast.success('Полная выгрузка с историей сохранена.'); }
  };
  const perform = async (expected: number, mutation: Parameters<CopyRegistryModel['mutate']>[1]) => {
    try { acceptResult(await model.mutate(expected, mutation)); }
    catch (error) { if (current()) toast.error(copyRegistryMessages[normalizeCopyRegistryError(error).code]); }
  };
  const retry = async () => { try { acceptResult(await model.retry()); } catch (error) { if (current()) toast.error(copyRegistryMessages[normalizeCopyRegistryError(error).code]); } };
  const reload = async () => { await model.reload(); if (current()) await loadAux(); };
  const openHistory = async (record: CopyRecord, more = false) => {
    if (!current() || disabled) return;
    const ticket = ++historyEpoch.current, after = more && history?.record.id === record.id ? history.next : null;
    if (more && after === null) return;
    setHistory(previous => ({ record, rows: more ? previous?.rows ?? [] : [], next: after, loading: true, error: null }));
    try {
      const result = await model.read({ kind: 'history', record_id: record.id, after_revision: after, limit: 100 });
      if (!current() || ticket !== historyEpoch.current || result.kind !== 'history') return;
      setHistory(previous => ({ record, rows: more ? [...previous?.rows ?? [], ...result.history] : result.history, next: result.next_after_revision, loading: false, error: null }));
    } catch (error) { if (current() && ticket === historyEpoch.current) setHistory(previous => previous ? { ...previous, loading: false, error: copyRegistryMessages[normalizeCopyRegistryError(error).code] } : null); }
  };
  const openImport = async (importId: string) => {
    if (!current() || disabled || !caps?.can_inventory_local) return;
    const ticket = ++importEpoch.current;
    try {
      const result = await model.read({ kind: 'import', import_id: importId });
      if (!current() || ticket !== importEpoch.current || result.kind !== 'import') return;
      setImportPreview(result.import); setImportSource({ origin: 'file', name: 'Сохранённый исходник переноса', raw: result.import.source_raw, sha256: result.import.source_sha256 }); setImportOpen(true);
    } catch (error) { if (current() && ticket === importEpoch.current) toast.error(copyRegistryMessages[normalizeCopyRegistryError(error).code]); }
  };
  const download = async (summary: CopyExportSummary, kind: 'html' | 'json' | 'xlsx') => {
    if (!current() || downloadBusy || !caps?.can_export) return;
    setDownloadBusy(summary.id);
    try {
      const expected = { organizationId: model.organizationId, scope: model.registryScope, exportId: summary.id };
      const readExport = async () => { const result = await model.read({ kind: 'export', export_id: summary.id }); if (result.kind !== 'export') throw new Error('wrong export'); return result.export; };
      if (kind === 'xlsx') await downloadCopyRegistryExcel(readExport, expected, current);
      else { const verified = await verifyCopyRegistryExport(await readExport(), expected, current); downloadVerifiedCopyRegistryExport(verified, summary.id, kind, current); }
    } catch (error) { if (current()) toast.error(copyRegistryMessages[normalizeCopyRegistryError(error).code]); }
    finally { if (current()) setDownloadBusy(null); }
  };
  const submitAction = async () => {
    if (!action || disabled || !current()) return;
    setActionError(null);
    if (!actionReason.trim()) { setActionError(copyRegistryMessages.INVALID_INPUT); return; }
    const parsed = action.kind === 'transfer' ? copyTransferSchema.safeParse({ ...transfer, note: transfer.note.trim() }) : null;
    if (parsed && !parsed.success) { setActionError(copyRegistryMessages.INVALID_INPUT); return; }
    try {
      const result = await model.mutate(action.record.revision, action.kind === 'archive'
        ? { action: 'archive', record_id: action.record.id, reason: actionReason.trim() }
        : { action: 'transfer', record_id: action.record.id, transfer: (parsed && 'data' in parsed ? parsed.data : undefined) as CopyTransfer, reason: actionReason.trim() });
      if (current()) acceptResult(result);
    } catch (failure) {
      if (current()) {
        const code = normalizeCopyRegistryError(failure).code;
        const message = code === 'REVISION_CONFLICT'
          ? 'Запись изменил другой сотрудник. Введённые сведения сохранены в этой форме, действие не записано. Скопируйте нужный текст, нажмите «Отмена», обновите реестр и откройте актуальную запись.'
          : copyRegistryMessages[code];
        setActionError(message); toast.error(message);
      }
    }
  };
  const filtered = model.records.filter(record => {
    const query = search.trim().toLocaleLowerCase('ru');
    const text = [record.registration_id, record.data.declared_number, record.recipient_label, record.subject_label, record.original_label,
      record.data.original.kind === 'unresolved' ? record.data.original.document_number : ''].filter(Boolean).join(' ').toLocaleLowerCase('ru');
    return (showArchived || !record.archived) && (copyType === 'all' || record.data.copy_type === copyType) && (!query || text.includes(query))
      && isWithinInterval(parseISO(record.data.document_date), { start: dates.from, end: dates.to });
  });
  const header = <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-4"><Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl" aria-label="Назад к журналам"><ArrowLeft className="w-5 h-5" /></Button><div><h2 className="text-xl font-semibold">Журнал копий и дубликатов</h2><p className="text-sm text-muted-foreground">Общий реестр{model.registryScope.kind === 'group' ? ' этой группы' : ' организации'}. Передача получателю фиксируется отдельно.</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={reload} disabled={model.saving} className="rounded-xl"><RotateCw className="w-4 h-4 mr-2" />Обновить</Button>{caps?.can_inventory_local && <Button variant="outline" onClick={() => { importEpoch.current++; setImportSource(null); setImportPreview(null); setImportOpen(true); }} disabled={disabled} className="rounded-xl"><Upload className="w-4 h-4 mr-2" />Перенести прежние записи</Button>}<Button variant="outline" onClick={() => setEditor({ record: null })} disabled={disabled || !caps?.can_create || auxBusy} className="rounded-xl"><Plus className="w-4 h-4 mr-2" />Добавить</Button><Button onClick={() => perform(model.registryRevision, { action: 'capture_export' })} disabled={disabled || !caps?.can_export} className="rounded-xl"><FileSpreadsheet className="w-4 h-4 mr-2" />Сохранить полную выгрузку</Button></div></div>;
  if (model.loading && !model.records.length) return <div className="space-y-6">{header}<div className="flex items-center justify-center h-64"><SigmaSpinner size="lg" /></div></div>;
  if (!caps?.can_read) return <div className="space-y-6">{header}<p role="alert" className="text-sm text-muted-foreground">{copyRegistryMessages[model.error ?? 'ACCESS_DENIED']}</p></div>;
  return <div className="space-y-6">
    {header}
    <div className="rounded-xl border p-3 text-sm space-y-2"><p>Это общий реестр копий документов. Запись в нём не оформляет выдачу документа об образовании или его дубликата и не резервирует их номера.</p><Link className="text-primary underline" to={model.registryScope.kind==='group'?'/organization?tab=journals&journalView=auto&journalType=education_documents&groupId='+encodeURIComponent(model.registryScope.group_id)+'&returnToGroupId='+encodeURIComponent(model.registryScope.group_id):'/organization?tab=documents&documentView=journals&journal=education_documents'}>Оформить документ об образовании или связанный дубликат</Link></div>
    {(model.error || model.mutationError) && <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2"><p className="text-sm">{copyRegistryMessages[model.mutationError ?? model.error!]}</p>{model.pending && <div className="flex gap-2"><Button variant="outline" onClick={retry} disabled={model.saving}>Повторить тот же запрос</Button>{model.mutationError === 'REVISION_CONFLICT' && <Button variant="ghost" onClick={() => { if (model.cancelRejected()) { setEditor(null); setImportOpen(false); } }}>Отменить отклонённый запрос</Button>}</div>}</div>}
    {!caps.can_create && <p className="text-sm text-muted-foreground">Добавление записи требует права вести реестр и доступа к сохранённой версии оригинала. Доступ к файлам не предоставляется автоматически.</p>}
    {auxError && <p role="alert" className="text-sm text-muted-foreground">{auxError}</p>}
    <div className="grid grid-cols-3 gap-4">{[
      { icon: FileText, background: 'bg-blue-500/10', foreground: 'text-blue-500', label: 'Записей в выборке', value: filtered.length },
      { icon: Copy, background: 'bg-green-500/10', foreground: 'text-green-500', label: 'Копий в выборке', value: filtered.filter(record => record.data.copy_type === 'copy').length },
      { icon: FileText, background: 'bg-amber-500/10', foreground: 'text-amber-500', label: 'Дубликатов в выборке', value: filtered.filter(record => record.data.copy_type === 'duplicate').length },
    ].map((item, index) => <div key={index} className="bg-card rounded-xl border border-border p-4"><div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-lg ${item.background} flex items-center justify-center`}><item.icon className={`w-5 h-5 ${item.foreground}`} /></div><div><p className="text-2xl font-bold">{item.value}</p><p className="text-xs text-muted-foreground">{item.label}</p></div></div></div>)}</div>
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3"><div className="flex flex-wrap items-center gap-4"><div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Поиск по загруженным записям..." value={search} onChange={event => setSearch(event.target.value)} className="pl-10 rounded-xl" /></div><div className="min-w-[180px]"><CopyChoice label="Тип записей" value={copyType} options={[{ value: 'all', label: 'Все типы' }, { value: 'copy', label: 'Копии' }, { value: 'duplicate', label: 'Дубликаты' }]} onChange={setCopyType} /></div><Popover><PopoverTrigger asChild><Button variant="outline" className="rounded-xl"><CalendarIcon className="w-4 h-4 mr-2" />{format(dates.from, 'dd.MM.yy')} – {format(dates.to, 'dd.MM.yy')}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><Calendar mode="range" selected={dates} onSelect={range => { if (range?.from && range?.to) setDates({ from: range.from, to: range.to }); }} locale={ru} numberOfMonths={2} /></PopoverContent></Popover><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />Показать архив</label></div><p className="text-xs text-muted-foreground">Загружено записей: {model.records.length}{model.next ? '; есть следующая страница' : ''}. Фильтры относятся к загруженным страницам. Полная сохранённая выгрузка включает весь доступный реестр и историю.</p></div>
    {filtered.length ? <div className="bg-card rounded-2xl border border-border overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-12 text-center">№</TableHead><TableHead>Внутренний номер</TableHead><TableHead>Тип</TableHead><TableHead>Получатель</TableHead><TableHead>Оригинал</TableHead><TableHead>Дата документа</TableHead><TableHead>Передача</TableHead><TableHead>Действия</TableHead></TableRow></TableHeader><TableBody>{filtered.map((record, index) => <TableRow key={record.id} className={record.archived ? 'opacity-70' : undefined}>
      <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell><TableCell><Badge variant="outline" className="rounded font-mono">{record.registration_id}</Badge>{record.data.declared_number && <p className="text-xs text-muted-foreground mt-1">Прежний: {record.data.declared_number}</p>}{record.archived && <Badge variant="outline" className="mt-1">В архиве</Badge>}</TableCell>
      <TableCell><Badge variant="outline" className={cn('rounded', record.data.copy_type === 'copy' ? 'border-green-500/50 text-green-600 bg-green-500/10' : 'border-amber-500/50 text-amber-600 bg-amber-500/10')}>{record.data.copy_type === 'copy' ? 'Копия' : 'Дубликат'}</Badge></TableCell>
      <TableCell><div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /><span className="font-medium">{record.recipient_label}</span></div>{record.subject_label && <p className="text-xs text-muted-foreground">Участник оригинала: {record.subject_label}</p>}{record.data.recipient.kind === 'external' && <p className="text-xs text-muted-foreground">Введённые сведения о получателе</p>}</TableCell>
      <TableCell><p className="text-sm">{record.original_label ?? (record.data.original.kind === 'unresolved' ? `Историческое описание: № ${record.data.original.document_number}` : 'Недоступен с текущими правами')}</p>{record.data.original.kind === 'unresolved' && <p className="text-xs text-muted-foreground">Связь с оригиналом не подтверждена</p>}<p className="text-xs text-muted-foreground">Основание: {COPY_REASONS.find(reason => reason.value === record.data.basis.reason)?.label}</p></TableCell>
      <TableCell>{displayDate(record.data.document_date)}<p className="text-xs text-muted-foreground">Сообщённая дата</p></TableCell><TableCell>{record.latest_transfer ? <><p>{transferLabels[record.latest_transfer.method]}</p><p className="text-xs text-muted-foreground">Сообщено: {displayDate(record.latest_transfer.reported_date)}</p></> : <span className="text-sm text-muted-foreground">Не зафиксирована</span>}</TableCell>
      <TableCell><div className="flex flex-wrap gap-1"><Button variant="ghost" size="icon" aria-label={'Исправить ' + record.registration_id} disabled={disabled || !record.can_edit || record.archived} onClick={() => setEditor({ record })}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="icon" aria-label={'История ' + record.registration_id} disabled={disabled} onClick={() => openHistory(record)}><History className="w-4 h-4" /></Button><Button variant="ghost" size="icon" aria-label={'Зафиксировать передачу ' + record.registration_id} disabled={disabled || !record.can_transfer || record.archived} onClick={() => { setAction({ kind: 'transfer', record }); setActionError(null); setActionReason(''); setTransfer({ method: 'in_person', reported_date: format(new Date(), 'yyyy-MM-dd'), note: '', evidence: null }); }}><Truck className="w-4 h-4" /></Button><Button variant="ghost" size="icon" aria-label={'В архив ' + record.registration_id} disabled={disabled || !record.can_archive || record.archived} onClick={() => { setAction({ kind: 'archive', record }); setActionError(null); setActionReason(''); }}><Archive className="w-4 h-4" /></Button></div><p className="text-xs text-muted-foreground">Версия {record.revision}</p></TableCell>
    </TableRow>)}</TableBody></Table></div></div> : <div className="bg-card rounded-2xl border border-border p-12 text-center"><Copy className="w-12 h-12 mx-auto text-muted-foreground mb-4" /><h3 className="font-semibold mb-2">Нет записей в выборке</h3><p className="text-muted-foreground">{model.records.length ? 'Измените фильтры или загрузите следующую страницу.' : 'Добавьте запись или перенесите прежний журнал с предпросмотром.'}</p></div>}
    {model.next && <Button variant="outline" onClick={model.loadMore} disabled={disabled} className="rounded-xl">Загрузить ещё записи</Button>}
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3"><h3 className="font-semibold">Сохранённые полные выгрузки</h3><p className="text-xs text-muted-foreground">Каждая выгрузка фиксирует весь доступный реестр и историю на момент подготовки. Исправления не меняют прежние файлы. Скачивание повторно проверяет текущий доступ.</p>{exports.map(saved => <div key={saved.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><p className="text-sm">{displayDate(saved.created_at)} · записей {saved.record_count} · версий в истории {saved.history_count}</p><div className="flex gap-2">{(['html', 'json', 'xlsx'] as const).map(kind => <Button key={kind} variant="outline" size="sm" onClick={() => download(saved, kind)} disabled={!!downloadBusy || disabled || !caps.can_export}><Download className="w-4 h-4 mr-1" />{kind === 'xlsx' ? 'Excel' : kind.toUpperCase()}</Button>)}</div></div>)}{!exports.length && <p className="text-sm text-muted-foreground">Сохранённых выгрузок пока нет.</p>}{exportsNext && <Button variant="outline" onClick={() => moreAux('exports')} disabled={auxBusy || disabled}>Ещё выгрузки</Button>}</div>
    {caps.can_inventory_local && <div className="bg-card rounded-2xl border border-border p-4 space-y-3"><h3 className="font-semibold">Предпросмотры и отчёты переноса</h3>{imports.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><p className="text-sm">{displayDate(item.created_at)} · строк {item.row_count} · {item.status === 'applied' ? `перенесено ${item.report_counts?.imported ?? 0}, повторов ${item.report_counts?.reused ?? 0}, пропущено ${item.report_counts?.skipped ?? 0}` : 'предпросмотр без переноса'}</p><Button variant="outline" size="sm" onClick={() => openImport(item.id)} disabled={disabled}>Открыть источник и отчёт</Button></div>)}{!imports.length && <p className="text-sm text-muted-foreground">Переносов пока нет. Прежний локальный журнал сохраняется отдельно до вашего решения.</p>}{importsNext && <Button variant="outline" onClick={() => moreAux('imports')} disabled={auxBusy || disabled}>Ещё отчёты</Button>}</div>}
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !model.saving && !model.pending) setEditor(null); }}><DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editor?.record ? 'Исправить запись реестра' : 'Добавить запись реестра'}</DialogTitle><DialogDescription className="sr-only">Свяжите запись с оригиналом и получателем, укажите основание.</DialogDescription></DialogHeader>{editor && <CopyRegistryForm key={editor.record?.id ?? 'new'} model={model} record={editor.record} originals={originals} people={people} originalsNext={!!originalsNext} peopleNext={!!peopleNext} onMoreOriginals={() => moreAux('originals')} onMorePeople={() => moreAux('people')} onCancel={() => setEditor(null)} onSaved={acceptResult} />}</DialogContent></Dialog>
    <Dialog open={!!action} onOpenChange={open => { if (!open && !model.saving && !model.pending) setAction(null); }}><DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{action?.kind === 'archive' ? 'Перенести запись в архив' : 'Зафиксировать сообщение о передаче'}</DialogTitle><DialogDescription className="sr-only">Причина и сведения сохранятся в истории записи.</DialogDescription></DialogHeader><fieldset disabled={disabled} className="space-y-4">{action?.kind === 'archive' ? <p className="text-sm text-muted-foreground">Запись, внутренний номер, подтверждения и вся история останутся в общем реестре.</p> : <><p className="text-sm text-muted-foreground">Сотрудник фиксирует сообщение сейчас. Выбранная дата остаётся сообщённой; подпись и подтверждение получения автоматически не создаются.</p><CopyChoice label="Способ передачи" value={transfer.method} options={Object.entries(transferLabels).map(([value, label]) => ({ value, label }))} onChange={value => setTransfer(previous => ({ ...previous, method: value as CopyTransfer['method'] }))} disabled={disabled} /><div className="space-y-2"><Label htmlFor={actionId + '-date'}>Сообщённая дата передачи *</Label><Input id={actionId + '-date'} type="date" value={transfer.reported_date} onChange={event => setTransfer(previous => ({ ...previous, reported_date: event.target.value }))} className="rounded-xl" /></div><div className="space-y-2"><Label htmlFor={actionId + '-note'}>Сведения о передаче *</Label><Textarea id={actionId + '-note'} value={transfer.note} maxLength={2000} onChange={event => setTransfer(previous => ({ ...previous, note: event.target.value }))} className="rounded-xl" /></div><CopyChoice label="Подтверждение передачи" value={transfer.evidence?.version_id ?? 'none'} options={[{ value: 'none', label: 'Не приложено' }, ...originals.map(choice => ({ value: choice.original.version_id, label: choice.label }))]} onChange={value => setTransfer(previous => ({ ...previous, evidence: originals.find(choice => choice.original.version_id === value)?.original ?? null }))} disabled={disabled} />{originalsNext && <Button variant="outline" size="sm" onClick={() => moreAux('originals')} disabled={auxBusy || disabled}>Ещё подтверждения</Button>}</>}<div className="space-y-2"><Label htmlFor={actionId + '-reason'}>Причина фиксации *</Label><Textarea id={actionId + '-reason'} value={actionReason} maxLength={2000} onChange={event => setActionReason(event.target.value)} className="rounded-xl" /></div></fieldset>{actionError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAction(null)} disabled={disabled}>Отмена</Button><Button onClick={submitAction} disabled={disabled || !actionReason.trim()}>Сохранить</Button></div></DialogContent></Dialog>
    <Dialog open={!!history} onOpenChange={open => { if (!open) { historyEpoch.current++; setHistory(null); } }}><DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>История записи {history?.record.registration_id}</DialogTitle><DialogDescription className="sr-only">Сохранённые версии и причины изменений в порядке регистрации.</DialogDescription></DialogHeader>{history?.error && <p role="alert" className="text-sm text-destructive">{history.error}</p>}{history?.rows.map(entry => <div key={entry.id} className="rounded-xl border border-border p-4 space-y-2"><p className="font-medium">Версия {entry.revision} · {historyLabels[entry.action]}</p><p className="text-xs text-muted-foreground">{format(parseISO(entry.recorded_at), 'dd.MM.yyyy HH:mm')} · {entry.recorded_by_label ?? 'Сотрудник платформы'}</p><p className="text-sm">Основание изменения: {entry.reason || 'Первоначальная регистрация'}</p><p className="text-sm">Прежний номер: {entry.snapshot.data.declared_number ?? 'не указан'} · дата: {displayDate(entry.snapshot.data.document_date)}</p><p className="text-sm">Получатель: {entry.snapshot.data.recipient.kind === 'external' ? entry.snapshot.data.recipient.name : 'Сохранённая связь с участником платформы'}</p><p className="text-sm">Основание: {entry.snapshot.data.basis.note}</p>{entry.snapshot.data.notes && <p className="text-sm">Примечание: {entry.snapshot.data.notes}</p>}<p className="text-xs text-muted-foreground">{entry.snapshot.data.original.kind === 'unresolved' ? `Историческое описание оригинала: № ${entry.snapshot.data.original.document_number}` : 'Связь с точной сохранённой версией оригинала'} · {entry.snapshot.archived ? 'в архиве' : 'активна'} · {entry.snapshot.latest_transfer ? `передача сообщена на ${displayDate(entry.snapshot.latest_transfer.reported_date)}` : 'передача не зафиксирована'}</p></div>)}{history?.loading && <SigmaSpinner size="sm" />}{history?.next !== null && history && <Button variant="outline" onClick={() => openHistory(history.record, true)} disabled={history.loading}>Ещё версии</Button>}</DialogContent></Dialog>
    <Dialog open={importOpen} onOpenChange={open => { if (!open && !model.saving && !model.pending) { importEpoch.current++; setImportOpen(false); } }}><DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Перенос прежнего журнала</DialogTitle><DialogDescription className="sr-only">Проверьте исходник и решения для всех строк до подтверждения переноса.</DialogDescription></DialogHeader>{importOpen && <CopyRegistryImport model={model} source={importSource} preview={importPreview} onSource={source => { importEpoch.current++; setImportSource(source); setImportPreview(null); }} onResult={acceptResult} />}</DialogContent></Dialog>
  </div>;
}
