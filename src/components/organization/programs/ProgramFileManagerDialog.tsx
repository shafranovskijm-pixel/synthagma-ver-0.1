import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrgDocumentVersionsDialog } from '@/components/organization/OrgDocumentVersionsDialog';
import { createScopedOrgDocumentTransport, listProgramFiles, prepareProgramFile, programFileScopeCurrent, readProgramFile,
  requireProgramFileScope, type PreparedProgramFile, type ProgramFile, type ProgramFileScope } from '@/lib/programFiles';

interface Props { open: boolean; onOpenChange(open: boolean): void; scope: ProgramFileScope; canWrite: boolean; onChanged?(): void | Promise<void> }
type View = { owner: string; items: ProgramFile[]; next: string | null; loading: boolean; saving: boolean; error: string | null; saved: string | null; selected: ProgramFile | null };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Не удалось подтвердить действие. Повторите загрузку.';

export function ProgramFileManagerDialog({ open, onOpenChange, scope, canWrite, onChanged }: Props) {
  const owner = useRef({ key: '', epoch: 0 });
  const contextKey = `${scope.key}:${open}:${canWrite}`;
  if (owner.current.key !== contextKey) owner.current = { key: contextKey, epoch: owner.current.epoch + 1 };
  const epoch = owner.current.epoch, ownerKey = contextKey + ':' + epoch;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const currentScope = useMemo<ProgramFileScope>(() => ({ ...scope, key: ownerKey,
    current: () => open && mounted.current && owner.current.key === contextKey && owner.current.epoch === epoch && programFileScopeCurrent(scope) }), [scope, ownerKey]);
  const empty = (): View => ({ owner: ownerKey, items: [], next: null, loading: open, saving: false, error: null, saved: null, selected: null });
  const [view, setView] = useState<View>(empty);
  const [draft, setDraft] = useState({ owner: ownerKey, name: '', file: null as File | null });
  const [pages, setPages] = useState<{ owner: string; cursors: Array<string | null> }>({ owner: ownerKey, cursors: [null] });
  const pending = useRef<{ parentKey: string; operation: PreparedProgramFile } | null>(null);
  const sequence = useRef(0), busy = useRef(false);
  const historyOwner = useRef({ id: '', epoch: 0 });
  const visible = view.owner === ownerKey && programFileScopeCurrent(currentScope);
  const selected = visible ? view.selected : null;
  const selectedKey = selected?.document.id ?? '';
  if (historyOwner.current.id !== selectedKey) historyOwner.current = { id: selectedKey, epoch: historyOwner.current.epoch + 1 };
  const historyEpoch = historyOwner.current.epoch;
  const historyTransport = useMemo(() => createScopedOrgDocumentTransport({ ...currentScope, key: `${ownerKey}:file:${selectedKey}:${historyEpoch}`,
    current: () => programFileScopeCurrent(currentScope) && !!selectedKey && historyOwner.current.id === selectedKey && historyOwner.current.epoch === historyEpoch }, true), [currentScope, selectedKey, historyEpoch]);
  const visiblePages = pages.owner === ownerKey ? pages.cursors : [null];
  const cursor = visiblePages[visiblePages.length - 1];
  const resumable = pending.current?.parentKey === scope.key ? pending.current.operation : null;

  const load = async (after: string | null = cursor) => {
    if (!programFileScopeCurrent(currentScope)) return;
    const run = ++sequence.current;
    setView(v => ({ ...(v.owner === ownerKey ? v : empty()), loading: true, error: null }));
    try {
      const result = await listProgramFiles(currentScope, after); requireProgramFileScope(currentScope);
      if (run !== sequence.current) return;
      setView(v => ({ ...(v.owner === ownerKey ? v : empty()), items: result.items, next: result.next, loading: false }));
    } catch (error) {
      if (run === sequence.current && programFileScopeCurrent(currentScope)) setView(v => ({ ...v, owner: ownerKey, loading: false, error: errorText(error) }));
    }
  };
  useEffect(() => {
    ++sequence.current; busy.current = false;
    if (pending.current?.parentKey !== scope.key) pending.current = null;
    setView(empty()); setDraft({ owner: ownerKey, name: '', file: null }); setPages({ owner: ownerKey, cursors: [null] });
    if (open) void load(null);
    return () => { ++sequence.current; };
  }, [ownerKey]);

  const save = async () => {
    if (!canWrite || busy.current || !programFileScopeCurrent(currentScope)) return;
    const captured = draft.owner === ownerKey ? draft : null;
    if (!resumable && (!captured?.file || !captured.name.trim())) return;
    const run = ++sequence.current;
    busy.current = true;
    setView(v => ({ ...v, owner: ownerKey, saving: true, saved: null, error: null }));
    let confirmed = false;
    try {
      let operation = resumable;
      if (!operation) {
        const candidate = await prepareProgramFile(currentScope, captured!.name, captured!.file!); requireProgramFileScope(currentScope);
        if (run !== sequence.current) return;
        pending.current = { parentKey: scope.key, operation: candidate }; operation = candidate;
      }
      const saved = await operation.run(currentScope); requireProgramFileScope(currentScope);
      if (run !== sequence.current) return;
      // A confirmed write is consumed before optional refresh/notifications, never reinserted by a retry.
      if (pending.current?.operation === operation) pending.current = null;
      confirmed = true;
      setDraft({ owner: ownerKey, name: '', file: null });
      setView(v => ({ ...v, saving: false, saved: `Файл «${saved.document.name}» сохранён. Откройте историю и выполните внутреннее согласование.`, selected: saved }));
      await onChanged?.(); requireProgramFileScope(currentScope);
      await load();
    } catch (error) {
      if (run === sequence.current && programFileScopeCurrent(currentScope)) setView(v => ({ ...v, saving: false,
        error: confirmed ? 'Файл сохранён, но список не обновился. Обновите файлы программ.' : errorText(error) }));
    } finally { if (programFileScopeCurrent(currentScope)) { busy.current = false; setView(v => ({ ...v, saving: false })); } }
  };
  const openHistory = async (id: string) => {
    if (busy.current || !programFileScopeCurrent(currentScope)) return;
    const run = ++sequence.current;
    setView(v => ({ ...v, error: null }));
    try {
      const actual = await readProgramFile(currentScope, id); requireProgramFileScope(currentScope);
      if (run !== sequence.current) return;
      if (!actual) throw new Error('Файл недоступен. Обновите список.');
      setView(v => ({ ...v, selected: actual }));
    } catch (error) { if (run === sequence.current && programFileScopeCurrent(currentScope)) setView(v => ({ ...v, error: errorText(error) })); }
  };
  const closeHistory = () => {
    ++historyOwner.current.epoch; historyOwner.current.id = '';
    setView(v => ({ ...v, selected: null }));
    if (programFileScopeCurrent(currentScope)) { void load(); void Promise.resolve(onChanged?.()).catch(() => undefined); }
  };
  const changePage = (next: boolean) => {
    if (!visible || view.loading || view.saving) return;
    const values = next ? [...visiblePages, view.next] : visiblePages.slice(0, -1);
    if (!values.length || next && !view.next) return;
    setPages({ owner: ownerKey, cursors: values }); void load(values[values.length - 1]);
  };
  const close = (value: boolean) => {
    if (!value) { ++owner.current.epoch; ++sequence.current; ++historyOwner.current.epoch; }
    onOpenChange(value);
  };
  return <>
    <Dialog open={open} onOpenChange={close}><DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Файлы программ</DialogTitle><DialogDescription>Загрузите отдельный PDF программы. Сохранение файла, внутреннее согласование и утверждение сведений программы выполняются по отдельности.</DialogDescription></DialogHeader>
      {canWrite && <div className="rounded-lg border p-3 space-y-3">
        {resumable ? <p className="text-sm">Сохранение файла «{resumable.fileName}» пока не подтверждено. Повторите то же сохранение; новый файл не будет создан.</p> : <>
          <div className="space-y-2"><Label htmlFor="program-file-title">Название файла программы</Label><Input id="program-file-title" maxLength={200} value={draft.owner === ownerKey ? draft.name : ''} disabled={!visible || view.saving} onChange={e => setDraft(v => ({ ...v, owner: ownerKey, name: e.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="program-file-pdf">Файл программы PDF</Label><Input id="program-file-pdf" type="file" accept="application/pdf,.pdf" disabled={!visible || view.saving} onChange={e => { const file = e.target.files?.[0] ?? null; setDraft(v => ({ ...v, owner: ownerKey, file })); e.target.value = ''; }} /><p className="text-xs text-muted-foreground">До 20 МБ. Файл сохраняется без изменения содержимого.</p>{draft.owner === ownerKey && draft.file && <p className="text-sm">Выбран: {draft.file.name}</p>}</div>
        </>}
        <Button disabled={!visible || view.saving || !resumable && (draft.owner !== ownerKey || !draft.file || !draft.name.trim())} onClick={() => void save()}>{visible && view.saving ? 'Сохранение…' : resumable ? 'Повторить то же сохранение' : 'Загрузить файл программы'}</Button>
      </div>}
      {visible && view.saved && <p role="status" className="text-sm">{view.saved}</p>}
      {visible && view.error && <div role="alert" className="rounded-lg border p-3 space-y-2 text-sm"><p>{view.error}</p><Button variant="outline" disabled={view.saving || view.loading} onClick={() => void load()}>Обновить файлы программ</Button></div>}
      {(!visible || view.loading) ? <p role="status" className="text-sm">Загрузка файлов программ…</p> : <>
        {!view.items.length && <p className="text-sm text-muted-foreground">Отдельные файлы программ пока не загружены. Прежние документы и сведения программ сохранены.</p>}
        <div className="space-y-2">{view.items.map(item => <div key={item.document.id} className="rounded-lg border p-3 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium break-words">{item.document.name}</p><p className="text-xs text-muted-foreground break-words">{item.currentVersion ? `${item.currentVersion.file_name ?? 'Файл'} · версия ${item.currentVersion.version_number}` : 'Нет сохранённой версии файла'}</p></div><Button variant="outline" size="sm" disabled={view.saving} onClick={() => void openHistory(item.document.id)}>История и согласование</Button></div>)}</div>
        <div className="flex justify-between gap-2"><Button variant="outline" disabled={visiblePages.length < 2 || view.saving} onClick={() => changePage(false)}>Назад</Button><Button variant="outline" disabled={!view.next || view.saving} onClick={() => changePage(true)}>Следующая страница</Button></div>
      </>}
    </DialogContent></Dialog>
    {selected && <OrgDocumentVersionsDialog key={historyTransport.key} open={true} onOpenChange={value => { if (!value) closeHistory(); }} organizationId={scope.organizationId} documentId={selected.document.id} documentName={selected.document.name} canWrite={canWrite} accept="application/pdf,.pdf" transport={historyTransport} onRestored={() => { if (programFileScopeCurrent(currentScope)) { void load(); void Promise.resolve(onChanged?.()).catch(() => undefined); } }} />}
  </>;
}
