import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DocumentRegistryModel } from '@/hooks/useDocumentRegistry';
import type { RegistryFile, RegistryIncoming, RegistryRecord } from '@/lib/documentRegistry/contract';
import { loadRegistryFile, registryFilePreviewable, downloadRegistryBlob } from '@/lib/documentRegistry/files';
import { normalizeRegistryError, registryMessages, DocumentRegistryError } from '@/lib/documentRegistry/errors';
import { sameCopyValue } from '@/lib/copyRegistry/value';

type Subject = { kind: 'record'; row: RegistryRecord } | { kind: 'incoming'; row: RegistryIncoming };
export function useRegistryFileViewer(model: DocumentRegistryModel) {
  const mounted = useRef(true), epoch = useRef(0), url = useRef<string | null>(null);
  const frdoWitness = useRef<{ recordId: string; revision: number; file: RegistryFile } | null>(null);
  const [view, setView] = useState<{ title: string; loading: boolean; error: string | null; file: RegistryFile | null; url: string | null; blob: Blob | null } | null>(null);
  const current = () => mounted.current && model.scopeCurrent();
  const revoke = () => { if (url.current) URL.revokeObjectURL(url.current); url.current = null; };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; revoke(); }; }, []);
  const close = () => { epoch.current++; revoke(); frdoWitness.current = null; setView(null); };
  const open = async (subject: Subject, download = false) => {
    if (!current() || !model.scope) return;
    const ticket = ++epoch.current; revoke(); frdoWitness.current = null;
    setView({ title: subject.kind === 'record' ? subject.row.data.title : subject.row.title, loading: true, error: null, file: null, url: null, blob: null });
    try {
      const result = await model.read(subject.kind === 'record' ? { kind: 'file', record_id: subject.row.id, record_revision: subject.row.revision } : { kind: 'incoming_file', incoming_document_id: subject.row.id, expected_binding_hash: subject.row.binding_hash });
      if (!current() || ticket !== epoch.current || result.kind !== 'file' && result.kind !== 'incoming_file') return;
      const source = subject.kind === 'record' ? subject.row.data.source : subject.row.linked_source ?? undefined;
      const blob = await loadRegistryFile(model.scope, result.file, source);
      if (subject.kind === 'record' && result.file.kind === 'frdo_packet_artifact') {
        const after = await model.read({ kind: 'file', record_id: subject.row.id, record_revision: subject.row.revision });
        if (after.kind !== 'file' || !sameCopyValue(after.file, result.file)) throw new DocumentRegistryError('SOURCE_CHANGED');
      }
      if (!current() || ticket !== epoch.current) return;
      if (download) { downloadRegistryBlob(blob, result.file.file_name, current); setView(null); return; }
      if (subject.kind === 'record' && result.file.kind === 'frdo_packet_artifact') frdoWitness.current = { recordId: subject.row.id, revision: subject.row.revision, file: result.file };
      const nextUrl = registryFilePreviewable(result.file) ? URL.createObjectURL(new Blob([blob], { type: result.file.mime })) : null;
      if (!current() || ticket !== epoch.current) { if (nextUrl) URL.revokeObjectURL(nextUrl); return; }
      url.current = nextUrl; setView({ title: subject.kind === 'record' ? subject.row.data.title : subject.row.title, loading: false, error: null, file: result.file, url: nextUrl, blob });
    } catch (failure) { if (current() && ticket === epoch.current) setView(previous => previous ? { ...previous, loading: false, error: registryMessages[normalizeRegistryError(failure).code] } : null); }
  };
  const save = async () => {
    if (!current() || !view?.blob || !view.file) return;
    const ticket = epoch.current, witness = frdoWitness.current;
    try {
      if (view.file.kind === 'frdo_packet_artifact') {
        if (!witness) throw new DocumentRegistryError('SOURCE_CHANGED');
        const fresh = await model.read({ kind: 'file', record_id: witness.recordId, record_revision: witness.revision });
        if (fresh.kind !== 'file' || !sameCopyValue(fresh.file, witness.file)) throw new DocumentRegistryError('SOURCE_CHANGED');
      }
      if (current() && ticket === epoch.current) downloadRegistryBlob(view.blob, view.file.file_name, current);
    } catch (failure) { if (current() && ticket === epoch.current) { frdoWitness.current = null; setView(old => old ? { ...old, blob: null, file: null, error: registryMessages[normalizeRegistryError(failure).code] } : null); } }
  };
  const dialog = <Dialog open={!!view} onOpenChange={open => { if (!open) close(); }}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl"><DialogHeader><DialogTitle>{view?.title}</DialogTitle><DialogDescription className="sr-only">Файл по текущему доступу к точной сохранённой версии</DialogDescription></DialogHeader>{view?.loading && <p role="status" className="text-sm text-muted-foreground">Загрузка файла...</p>}{view?.error && <p role="alert" className="text-sm text-destructive">{view.error}</p>}{view?.url && view.file && (view.file.mime === 'application/pdf' ? <iframe src={view.url} title={view.title} className="w-full h-[70vh] rounded-lg border bg-white" /> : <img src={view.url} alt={view.title} className="w-full max-h-[70vh] object-contain rounded-lg border bg-muted" />)}{view?.file && !view.url && <p className="text-sm text-muted-foreground">Этот формат можно скачать. Встроенный просмотр доступен для PDF и изображений.</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>Закрыть</Button>{view?.blob && <Button onClick={() => void save()}>Скачать файл</Button>}</div></DialogContent></Dialog>;
  return { open, dialog, busy: !!view?.loading };
}
