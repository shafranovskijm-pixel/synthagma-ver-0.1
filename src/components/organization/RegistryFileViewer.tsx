import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DocumentRegistryModel } from '@/hooks/useDocumentRegistry';
import type { RegistryFile, RegistryIncoming, RegistryRecord } from '@/lib/documentRegistry/contract';
import { loadRegistryFile, registryFilePreviewable, downloadRegistryBlob } from '@/lib/documentRegistry/files';
import { normalizeRegistryError, registryMessages } from '@/lib/documentRegistry/errors';

type Subject = { kind: 'record'; row: RegistryRecord } | { kind: 'incoming'; row: RegistryIncoming };
export function useRegistryFileViewer(model: DocumentRegistryModel) {
  const mounted = useRef(true), epoch = useRef(0), url = useRef<string | null>(null);
  const [view, setView] = useState<{ title: string; loading: boolean; error: string | null; file: RegistryFile | null; url: string | null; blob: Blob | null } | null>(null);
  const current = () => mounted.current && model.scopeCurrent();
  const revoke = () => { if (url.current) URL.revokeObjectURL(url.current); url.current = null; };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; revoke(); }; }, []);
  const close = () => { epoch.current++; revoke(); setView(null); };
  const open = async (subject: Subject, download = false) => {
    if (!current() || !model.scope) return;
    const ticket = ++epoch.current; revoke();
    setView({ title: subject.kind === 'record' ? subject.row.data.title : subject.row.title, loading: true, error: null, file: null, url: null, blob: null });
    try {
      const result = await model.read(subject.kind === 'record' ? { kind: 'file', record_id: subject.row.id, record_revision: subject.row.revision } : { kind: 'incoming_file', incoming_document_id: subject.row.id, expected_binding_hash: subject.row.binding_hash });
      if (!current() || ticket !== epoch.current || result.kind !== 'file' && result.kind !== 'incoming_file') return;
      const source = subject.kind === 'record' ? subject.row.data.source : subject.row.linked_source ?? undefined;
      const blob = await loadRegistryFile(model.scope, result.file, source);
      if (!current() || ticket !== epoch.current) return;
      if (download) { downloadRegistryBlob(blob, result.file.file_name, current); setView(null); return; }
      const nextUrl = registryFilePreviewable(result.file) ? URL.createObjectURL(new Blob([blob], { type: result.file.mime })) : null;
      if (!current() || ticket !== epoch.current) { if (nextUrl) URL.revokeObjectURL(nextUrl); return; }
      url.current = nextUrl; setView({ title: subject.kind === 'record' ? subject.row.data.title : subject.row.title, loading: false, error: null, file: result.file, url: nextUrl, blob });
    } catch (failure) { if (current() && ticket === epoch.current) setView(previous => previous ? { ...previous, loading: false, error: registryMessages[normalizeRegistryError(failure).code] } : null); }
  };
  const save = () => { if (current() && view?.blob && view.file) downloadRegistryBlob(view.blob, view.file.file_name, current); };
  const dialog = <Dialog open={!!view} onOpenChange={open => { if (!open) close(); }}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl"><DialogHeader><DialogTitle>{view?.title}</DialogTitle><DialogDescription className="sr-only">Файл по текущему доступу к точной сохранённой версии</DialogDescription></DialogHeader>{view?.loading && <p role="status" className="text-sm text-muted-foreground">Загрузка файла...</p>}{view?.error && <p role="alert" className="text-sm text-destructive">{view.error}</p>}{view?.url && view.file && (view.file.mime === 'application/pdf' ? <iframe src={view.url} title={view.title} className="w-full h-[70vh] rounded-lg border bg-white" /> : <img src={view.url} alt={view.title} className="w-full max-h-[70vh] object-contain rounded-lg border bg-muted" />)}{view?.file && !view.url && <p className="text-sm text-muted-foreground">Этот формат можно скачать. Встроенный просмотр доступен для PDF и изображений.</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>Закрыть</Button>{view?.blob && <Button onClick={save}>Скачать файл</Button>}</div></DialogContent></Dialog>;
  return { open, dialog, busy: !!view?.loading };
}
