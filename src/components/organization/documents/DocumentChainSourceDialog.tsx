import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { useAuth } from '@/hooks/useAuth';
import { captureOfflineActor } from '@/utils/courseCache';
import { downloadRegistryBlob } from '@/lib/documentRegistry/files';
import { captureDocumentChainScope, documentChainScopeCurrent, normalizeChainError } from '@/lib/documentChain/client';
import { downloadChainEducationDocument, openDocumentChainSource, type OpenedChainDocument } from '@/lib/documentChain/source';
import type { ChainQuery, ChainScope } from '@/lib/documentChain/contract';

interface Props { organizationId: string; target: ChainScope; query: Extract<ChainQuery, { kind: 'source' | 'journal_source' }> | null; invalid?: boolean; enabled: boolean; accessKey: string; ownViewer?: boolean; onClose: () => void }
export function DocumentChainSourceDialog({ organizationId, target, query, invalid = false, enabled, accessKey, ownViewer = false, onClose }: Props) {
  const { user } = useAuth();
  const key = JSON.stringify([organizationId, target, query, invalid, enabled, accessKey, ownViewer, user?.id, captureOfflineActor(user?.id)]);
  const currentKey = useRef(key); currentKey.current = key;
  const [state, setState] = useState<{ key: string; loading: boolean; error: string | null; document: OpenedChainDocument | null; url: string | null }>({ key, loading: !!query, error: null, document: null, url: null });
  const [downloadBusy, setDownloadBusy] = useState(false);
  const current = useRef<() => boolean>(() => false);
  useEffect(() => {
    const controller = new AbortController(); let localUrl: string | null = null;
    const valid = () => currentKey.current === key && !controller.signal.aborted;
    current.current = valid; setDownloadBusy(false);
    setState({ key, loading: !!query && enabled && !invalid, error: invalid ? 'Не удалось определить точную версию документа.' : !enabled && query ? 'Доступ к документу не подтверждён.' : null, document: null, url: null });
    if (query && enabled && !invalid) void (async () => {
      try {
        const captured = captureDocumentChainScope(organizationId, target, valid, controller.signal);
        if (ownViewer) captured.expectedViewer = 'self';
        current.current = () => valid() && documentChainScopeCurrent(captured);
        const document = await openDocumentChainSource(captured, query);
        if (!current.current()) return;
        if (document.kind === 'file' && /^(application\/pdf|image\/(png|jpeg|gif|webp))$/i.test(document.mime)) localUrl = URL.createObjectURL(new Blob([document.blob], { type: document.mime }));
        if (!current.current()) { if (localUrl) URL.revokeObjectURL(localUrl); localUrl = null; return; }
        setState({ key, loading: false, error: null, document, url: localUrl });
      } catch (error) { if (valid()) setState({ key, loading: false, error: normalizeChainError(error).message, document: null, url: null }); }
    })();
    return () => { controller.abort(); if (localUrl) URL.revokeObjectURL(localUrl); };
    // The normalized key owns request scope and source identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const view = state.key === key ? state : { key, loading: !!query && enabled, error: null, document: null, url: null };
  const download = async () => {
    if (!current.current() || !view.document || downloadBusy) return;
    setDownloadBusy(true);
    try {
      if (view.document.kind === 'file') downloadRegistryBlob(view.document.blob, view.document.fileName, () => currentKey.current === key && current.current());
      if (view.document.kind === 'education') await downloadChainEducationDocument(view.document);
    } catch (error) { if (currentKey.current === key && current.current()) setState(old => old.key === key ? { ...old, error: normalizeChainError(error).message } : old); }
    finally { if (currentKey.current === key && current.current()) setDownloadBusy(false); }
  };
  return <Dialog open={!!query || invalid} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="min-w-0 max-w-4xl rounded-2xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>{view.document?.title || 'Документ ученика'}</DialogTitle><DialogDescription>{view.document?.kind === 'draft' ? 'Неподписанный проект. Официальный номер не присвоен.' : 'Точная сохранённая версия по текущему доступу.'}</DialogDescription></DialogHeader>
    {view.loading && <div role="status" className="flex items-center gap-2 py-8"><SigmaSpinner size="sm" />Проверяем документ…</div>}
    {view.error && <p role="alert" className="text-sm text-destructive">{view.error}</p>}
    {view.document?.kind === 'draft' && <iframe title={view.document.title} srcDoc={view.document.html} sandbox="" className="h-[65vh] w-full rounded-xl border border-border bg-white" />}
    {view.url && view.document?.kind === 'file' && (view.document.mime === 'application/pdf' ? <iframe title={view.document.title} src={view.url} className="h-[65vh] w-full rounded-xl border border-border bg-white" /> : <img src={view.url} alt={view.document.title} className="max-h-[65vh] w-full object-contain" />)}
    {view.document?.kind === 'file' && !view.url && <p className="text-sm text-muted-foreground">Этот формат можно скачать.</p>}
    {view.document?.kind === 'education' && <p className="text-sm">Документ № {view.document.number}. Сохранённый PDF можно скачать без повторной выдачи.</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" className="rounded-xl" onClick={onClose}>Закрыть</Button>{view.document && view.document.kind !== 'draft' && <Button className="rounded-xl" disabled={downloadBusy || !current.current()} onClick={() => void download()}>{downloadBusy ? 'Загрузка…' : view.document.kind === 'education' ? 'Скачать PDF' : 'Скачать файл'}</Button>}</div>
  </DialogContent></Dialog>;
}
